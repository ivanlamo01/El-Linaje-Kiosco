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
	.firestore.document("productos/{productId}")
	.onWrite(async (change, context) => {
			try {
				const before = change.before.exists ? change.before.data() : null;
				const after = change.after.exists ? change.after.data() : null;

				if ((after && after.syncSource === REMOTE_SOURCE) ||
						(before && before.syncSource === REMOTE_SOURCE)) {
					return;
				}

				const wasBebida = before && before.categoria === "bebidas";
				const isBebida = after && after.categoria === "bebidas";

				if (!wasBebida && !isBebida) return;

				const barcode = (after && after.barcode) || (before && before.barcode);
				if (!barcode) {
					logger.warn("Producto sin barcode, no se sincroniza", {
						productId: context.params.productId,
					});
					return;
				}

				const remoteApp = getRemoteApp(remoteServiceAccount.value());
				const remoteDb = remoteApp.firestore();
				const remoteDocRef = remoteDb.collection("productos").doc(String(barcode));

				if (!isBebida) {
					await remoteDocRef.delete();
					return;
				}

				const payload = {
					...after,
					syncSource: LOCAL_SOURCE,
					syncedAt: admin.firestore.FieldValue.serverTimestamp(),
				};
				await remoteDocRef.set(payload, { merge: true });
			} catch (err) {
				logger.error("Error sincronizando bebidas", err);
			}
		});

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
