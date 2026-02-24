import admin from 'firebase-admin';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

// Configuración de credenciales
const serviceAccountPath = path.resolve('ServiceAccount.json');

// Inicializar Firebase Admin
if (!admin.apps.length) {
  try {
    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('Firebase Admin inicializado con ServiceAccount.json.');
    } else {
      // Fallback a variables de entorno
      const envServiceAccount = {
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FB_PROJECT_ID,
        clientEmail: process.env.FB_CLIENT_EMAIL,
        privateKey: process.env.FB_PRIVATE_KEY ? process.env.FB_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
      };

      if (envServiceAccount.clientEmail && envServiceAccount.privateKey) {
        admin.initializeApp({
          credential: admin.credential.cert(envServiceAccount),
        });
        console.log('Firebase Admin inicializado con credenciales de entorno.');
      } else {
        console.warn('⚠️ No se encontró ServiceAccount.json ni credenciales completas en .env.');
        console.log('Intentando usar Application Default Credentials (ADC)...');
        admin.initializeApp();
      }
    }
  } catch (error) {
    console.error('Error inicializando Firebase Admin:', error);
    process.exit(1);
  }
}

const db = admin.firestore();
const auth = admin.auth();

async function makeAdmin(email) {
  if (!email) {
    console.error('Por favor proporciona un email.');
    console.log('Uso: node scripts/makeAdmin.js <email>');
    process.exit(1);
  }

  try {
    console.log(`Buscando usuario: ${email}...`);
    const user = await auth.getUserByEmail(email);
    const uid = user.uid;
    console.log(`Usuario encontrado: ${uid}`);

    // 1. Asignar Custom Claim
    await auth.setCustomUserClaims(uid, { isAdmin: true });
    console.log(`✅ Custom claim 'isAdmin: true' asignado a ${email}`);

    // 2. Actualizar documento en Firestore
    const userRef = db.collection('Usuarios').doc(uid);
    await userRef.set({ isAdmin: true }, { merge: true });
    console.log(`✅ Documento Firestore 'Usuarios/${uid}' actualizado con isAdmin: true`);

    console.log('\n--- ÉXITO ---');
    console.log(`El usuario ${email} ahora es administrador.`);
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 'auth/user-not-found') {
      console.error('El usuario no existe en Authentication.');
    }
    process.exit(1);
  }
}

const targetEmail = process.argv[2];
makeAdmin(targetEmail);
