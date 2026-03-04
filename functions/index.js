/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions");
const functions = require("firebase-functions/v1");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

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

async function syncProductChange(change, context, sourceCollection) {
	try {
		const before = change.before.exists ? change.before.data() : null;
		const after = change.after.exists ? change.after.data() : null;

		const syncSourceIsRemote =
			(after && after.syncSource === REMOTE_SOURCE) ||
			(before && before.syncSource === REMOTE_SOURCE);
		const syncedAtChanged = !isSameTimestamp(
			before && before.syncedAt,
			after && after.syncedAt
		);
		if (syncSourceIsRemote && syncedAtChanged) {
			return;
		}

		const localDb = admin.firestore();
		const beforeCategoryName = before ? await resolveCategoryName(before, localDb) : "";
		const afterCategoryName = after ? await resolveCategoryName(after, localDb) : "";

		const wasBebida = isBeverageName(beforeCategoryName);
		const isBebida = isBeverageName(afterCategoryName);

		if (!wasBebida && !isBebida) return;

		const barcode = getBarcode(after) || getBarcode(before);
		if (!barcode) {
			logger.warn("Producto sin barcode, no se sincroniza", {
				productId: context.params.productId,
				sourceCollection,
			});
			return;
		}

		const remoteApp = getRemoteApp(remoteServiceAccount.value());
		const remoteDb = remoteApp.firestore();

		if (!isBebida) {
			await deleteRemoteDocsByBarcode(remoteDb, barcode);
			return;
		}

		const remoteDocRef = await findOrCreateRemoteDoc(remoteDb, barcode);

		const payload = cleanUndefined({
			...(after || {}),
			barcode: String(barcode),
			Barcode: String(barcode),
			categoria: afterCategoryName || undefined,
			category: afterCategoryName || undefined,
			categoryName: afterCategoryName || undefined,
			categoryId: pickFirstString(after && after.category, after && after.categoria) || undefined,
			stock: Number((after && after.stock) || 0),
			syncSource: LOCAL_SOURCE,
			syncedAt: admin.firestore.FieldValue.serverTimestamp(),
		});

		await remoteDocRef.set(payload, {merge: true});
	} catch (err) {
		logger.error("Error sincronizando bebidas", {
			error: err instanceof Error ? err.message : String(err),
			sourceCollection,
			productId: context.params.productId,
		});
	}
}

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

exports.syncBebidasToRemote = functions
	.runWith({secrets: [remoteServiceAccount]})
	.firestore.document("Productos/{productId}")
	.onWrite(async (change, context) => {
			return syncProductChange(change, context, "Productos");
		});


// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
