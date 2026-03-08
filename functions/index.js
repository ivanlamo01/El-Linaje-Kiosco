/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const { setGlobalOptions } = require("firebase-functions");
const functions = require("firebase-functions/v1");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

// admin.initializeApp() already called below

admin.initializeApp();

const remoteServiceAccount = defineSecret("REMOTE_FIREBASE_SERVICE_ACCOUNT");
const LOCAL_SOURCE = "kiosco";
const REMOTE_SOURCE = "resto";

function normalizeText(value) {
	if (typeof value !== "string") return "";
	return value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim();
}

function isBeverageName(value) {
	const normalized = normalizeText(value);
	return normalized === "bebida" || normalized === "bebidas";
}

function pickFirstString(...values) {
	for (const value of values) {
		if (typeof value === "string" && value.trim()) return value;
	}
	return "";
}

async function resolveCategoryName(productData, localDb) {
	const safeProduct = productData || {};
	const directName = pickFirstString(
		safeProduct.categoryName,
		safeProduct.nombreCategoria,
		safeProduct.categoriaNombre,
		safeProduct.categoria,
		safeProduct.category
	);

	if (isBeverageName(directName)) {
		return directName;
	}

	const categoryId = pickFirstString(safeProduct.category, safeProduct.categoria);
	if (!categoryId) return directName;

	const categoryCollections = ["Categorias", "categorias"];
	for (const collectionName of categoryCollections) {
		const categorySnap = await localDb.collection(collectionName).doc(categoryId).get();
		if (categorySnap.exists) {
			const categoryData = categorySnap.data() || {};
			const categoryName = pickFirstString(categoryData.name, categoryData.nombre);
			if (categoryName) return categoryName;
		}
	}

	return directName;
}

function cleanUndefined(obj) {
	return Object.fromEntries(
		Object.entries(obj).filter(([, value]) => value !== undefined)
	);
}

function getBarcode(data) {
	const safeData = data || {};
	return pickFirstString(safeData.Barcode, safeData.barcode);
}

function toMillisOrNull(value) {
	if (!value) return null;
	if (typeof value.toMillis === "function") return value.toMillis();
	if (value instanceof Date) return value.getTime();
	if (typeof value === "number") return value;
	return null;
}

function isSameTimestamp(a, b) {
	const aMillis = toMillisOrNull(a);
	const bMillis = toMillisOrNull(b);
	if (aMillis === null || bMillis === null) return false;
	return aMillis === bMillis;
}

async function collectRemoteDocsByBarcode(remoteDb, barcode) {
	const collections = ["Productos"];
	const seen = new Set();
	const refs = [];

	for (const collectionName of collections) {
		const collectionRef = remoteDb.collection(collectionName);
		const byBarcode = await collectionRef.where("Barcode", "==", barcode).limit(5).get();
		const bybarcode = await collectionRef.where("barcode", "==", barcode).limit(5).get();

		for (const docSnap of [...byBarcode.docs, ...bybarcode.docs]) {
			if (seen.has(docSnap.ref.path)) continue;
			seen.add(docSnap.ref.path);
			refs.push(docSnap.ref);
		}
	}

	return refs;
}

async function findOrCreateRemoteDoc(remoteDb, barcode) {
	const matches = await collectRemoteDocsByBarcode(remoteDb, barcode);
	if (matches.length > 0) return matches[0];
	return remoteDb.collection("Productos").doc();
}

async function deleteRemoteDocsByBarcode(remoteDb, barcode) {
	const matches = await collectRemoteDocsByBarcode(remoteDb, barcode);
	if (!matches.length) return;
	await Promise.all(matches.map((ref) => ref.delete()));
}

/**
 * Si un producto es marcado como 'resto' y el stock cambia, 
 * informamos al Restaurante enviando syncSource: 'kiosco' para evitar bucles.
 */
exports.syncStockToResto = functions
	.runWith({ secrets: [remoteServiceAccount] })
	.firestore.document("Productos/{productId}")
	.onUpdate(async (change, context) => {
		const before = change.before.data();
		const after = change.after.data();

		// Solo si es un producto del restaurante
		if (after.syncSource !== REMOTE_SOURCE) return;

		// Solo si cambió el stock
		if (before.stock === after.stock) return;

		// Evitar bucle si el cambio viene de un proceso que ya marcó la fuente como 'kiosco'
		// Aunque en el Kiosco el syncSource debería seguir siendo 'resto' para estos items,
		// las actualizaciones HACIA el resto llevarán syncSource: 'kiosco'.

		const barcode = getBarcode(after);
		if (!barcode) return;

		try {
			const remoteApp = getRemoteApp(remoteServiceAccount.value());
			const remoteDb = remoteApp.firestore();

			const matches = await collectRemoteDocsByBarcode(remoteDb, barcode);
			if (matches.length === 0) {
				logger.warn("Producto 'resto' no encontrado en Restaurante para actualizar stock", { barcode });
				return;
			}

			// Actualizamos el stock en el Restaurante
			// IMPORTANTE: Enviamos syncSource: 'kiosco' para que el Restaurante sepa que no debe re-enviarlo
			await matches[0].update({
				stock: Number(after.stock),
				syncSource: LOCAL_SOURCE,
				syncedAt: admin.firestore.FieldValue.serverTimestamp()
			});

			logger.info("Stock sincronizado con Restaurante", { barcode, newStock: after.stock });
		} catch (err) {
			logger.error("Error sincronizando stock hacia Restaurante", {
				error: err instanceof Error ? err.message : String(err),
				barcode
			});
		}
	});

/**
 * Handle incoming products from Restaurant.
 * Merges by barcode and deletes the temporary document.
 */
exports.handleRestoProductSync = functions
	.firestore.document("Productos/{productId}")
	.onCreate(async (snap, context) => {
		const data = snap.data();

		// Solo procesamos si viene del restaurante
		if (data.syncSource !== REMOTE_SOURCE) return;

		const barcode = getBarcode(data);
		if (!barcode) return;

		const localDb = admin.firestore();

		try {
			// Buscar productos locales con el mismo código de barras que NO sean este nuevo doc
			const querySnap = await localDb.collection("Productos")
				.where("Barcode", "==", barcode)
				.get();

			let targetRef = null;
			for (const doc of querySnap.docs) {
				if (doc.id !== context.params.productId) {
					targetRef = doc.ref;
					break;
				}
			}

			if (targetRef) {
				// Actualizar el producto existente
				await targetRef.update({
					title: data.title || data.name || "",
					price: Number(data.price || 0),
					stock: Number(data.stock || 0),
					categoryName: data.categoryName || data.categoria || "",
					syncSource: REMOTE_SOURCE,
					syncedAt: admin.firestore.FieldValue.serverTimestamp()
				});
				logger.info("Producto existente actualizado desde Resto", { barcode });
			} else {
				// Si no existe, este nuevo doc permanece, pero nos aseguramos que tenga los datos limpios
				await snap.ref.update({
					syncSource: REMOTE_SOURCE,
					syncedAt: admin.firestore.FieldValue.serverTimestamp()
				});
				logger.info("Nuevo producto creado desde Resto", { barcode });
				return; // No lo borramos si es el único
			}

			// Borramos el documento duplicado/temporal
			await snap.ref.delete();

		} catch (err) {
			logger.error("Error en handleRestoProductSync", {
				error: err instanceof Error ? err.message : String(err),
				barcode
			});
		}
	});

function getRemoteApp(serviceAccountJson) {
	const existing = admin.apps.find((app) => app.name === "remote");
	if (existing) return existing;

	let serviceAccount;
	try {
		serviceAccount = JSON.parse(serviceAccountJson);
	} catch (err) {
		throw new Error("REMOTE_FIREBASE_SERVICE_ACCOUNT is not valid JSON");
	}

	return admin.initializeApp(
		{ credential: admin.credential.cert(serviceAccount) },
		"remote"
	);
}
