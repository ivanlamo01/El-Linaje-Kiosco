const admin = require('firebase-admin');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
dotenv.config({ path: '.env', quiet: true });

function resolveProjectId() {
  if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) return process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (process.env.FB_PROJECT_ID) return process.env.FB_PROJECT_ID;
  if (process.env.GOOGLE_CLOUD_PROJECT) return process.env.GOOGLE_CLOUD_PROJECT;

  const firebasercPath = path.resolve(process.cwd(), '.firebaserc');
  if (fs.existsSync(firebasercPath)) {
    try {
      const raw = fs.readFileSync(firebasercPath, 'utf8');
      const parsed = JSON.parse(raw);
      const projectFromRc = parsed?.projects?.default;
      if (projectFromRc) return projectFromRc;
    } catch (error) {
      console.warn('No se pudo leer .firebaserc para obtener projectId:', error.message);
    }
  }

  return undefined;
}

const serviceAccount = {
  projectId: resolveProjectId(),
  clientEmail: process.env.FB_CLIENT_EMAIL,
  privateKey: process.env.FB_PRIVATE_KEY ? process.env.FB_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
};

if (!admin.apps.length) {
  try {
    if (serviceAccount.clientEmail && serviceAccount.privateKey) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else {
      if (!serviceAccount.projectId) {
        throw new Error('No se pudo resolver projectId. Definí NEXT_PUBLIC_FIREBASE_PROJECT_ID, FB_PROJECT_ID o .firebaserc.');
      }
      admin.initializeApp({ projectId: serviceAccount.projectId });
    }
  } catch (error) {
    console.error('Error inicializando Firebase Admin:', error);
    process.exit(1);
  }
}

const db = admin.firestore();

function normalizeCategoryKey(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function formatCategoryName(name) {
  const compact = String(name || '').trim().replace(/\s+/g, ' ');
  if (!compact) return '';
  return compact.charAt(0).toUpperCase() + compact.slice(1);
}

async function getOrCreateAlmacenCategory(catsSnapshot) {
  const almacenLike = [];
  catsSnapshot.forEach((docSnap) => {
    const rawName = docSnap.data().name || '';
    const key = normalizeCategoryKey(rawName);
    if (key === 'almacen') {
      almacenLike.push({ id: docSnap.id, name: rawName, createdAt: docSnap.data().createdAt || null });
    }
  });

  if (almacenLike.length > 0) {
    const canonical = almacenLike[0];
    const canonicalName = formatCategoryName(canonical.name);
    if (canonicalName !== canonical.name) {
      await db.collection('Categorias').doc(canonical.id).update({ name: canonicalName });
    }
    return canonical.id;
  }

  const created = await db.collection('Categorias').add({
    name: 'Almacen',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`Se creó la categoría "Almacen" con ID ${created.id}`);
  return created.id;
}

async function moveProductsToCategory(fromCategoryId, toCategoryId) {
  if (!fromCategoryId || !toCategoryId || fromCategoryId === toCategoryId) return 0;
  const productsSnapshot = await db.collection('Productos').where('category', '==', fromCategoryId).get();
  if (productsSnapshot.empty) return 0;

  const BATCH_LIMIT = 500;
  let batch = db.batch();
  let count = 0;
  let total = 0;

  for (const docSnap of productsSnapshot.docs) {
    batch.update(docSnap.ref, { category: toCategoryId });
    count++;
    total++;

    if (count === BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
  }

  return total;
}

async function deduplicateCategoriesByName(preferredAlmacenId) {
  const catsSnapshot = await db.collection('Categorias').get();
  const byKey = new Map();

  catsSnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const rawName = data.name || '';
    const key = normalizeCategoryKey(rawName);
    if (!key) return;

    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ id: docSnap.id, name: rawName, createdAt: data.createdAt || null });
  });

  let migratedProducts = 0;
  let deletedCategories = 0;

  for (const [key, items] of byKey.entries()) {
    if (items.length <= 1) continue;

    let canonical = items[0];
    if (key === 'almacen' && preferredAlmacenId) {
      const preferred = items.find((item) => item.id === preferredAlmacenId);
      if (preferred) canonical = preferred;
    }

    for (const item of items) {
      if (item.id === canonical.id) continue;
      migratedProducts += await moveProductsToCategory(item.id, canonical.id);
      await db.collection('Categorias').doc(item.id).delete();
      deletedCategories++;
    }

    const canonicalName = formatCategoryName(canonical.name);
    if (canonicalName && canonicalName !== canonical.name) {
      await db.collection('Categorias').doc(canonical.id).update({ name: canonicalName });
    }
  }

  return { migratedProducts, deletedCategories };
}

async function migrateCategoryVariablesToAlmacen() {
  // 1. Obtener todas las categorías
  const catsSnapshot = await db.collection('Categorias').get();
  const almacenId = await getOrCreateAlmacenCategory(catsSnapshot);

  // 2. Mover cualquier categoría equivalente a Variables hacia Almacen
  let migratedFromVariables = 0;
  for (const docSnap of catsSnapshot.docs) {
    const key = normalizeCategoryKey(docSnap.data().name || '');
    if (key === 'variables') {
      migratedFromVariables += await moveProductsToCategory(docSnap.id, almacenId);
    }
  }

  // 3. Deduplicar categorías por nombre normalizado
  const dedupeResult = await deduplicateCategoriesByName(almacenId);

  // 4. Eliminar categorías "Variables" sobrantes
  const updatedCatsSnapshot = await db.collection('Categorias').get();
  let removedVariables = 0;
  for (const docSnap of updatedCatsSnapshot.docs) {
    const key = normalizeCategoryKey(docSnap.data().name || '');
    if (key === 'variables') {
      await db.collection('Categorias').doc(docSnap.id).delete();
      removedVariables++;
    }
  }

  console.log('\nMigración completa.');
  console.log(`Productos movidos de Variables a Almacen: ${migratedFromVariables}`);
  console.log(`Productos movidos por deduplicación: ${dedupeResult.migratedProducts}`);
  console.log(`Categorías duplicadas eliminadas: ${dedupeResult.deletedCategories}`);
  console.log(`Categorías Variables eliminadas: ${removedVariables}`);
  console.log(`Categoría destino Almacen ID: ${almacenId}`);
}

migrateCategoryVariablesToAlmacen().catch(err => {
  console.error('Error durante la migración:', err);
  process.exit(1);
});
