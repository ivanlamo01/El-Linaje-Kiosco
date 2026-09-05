import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  getDoc,
  QueryDocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "../../config/firebase";
import { ProductoData } from "../../types/productTypes";

// ---------------------- TIPOS AUXILIARES ----------------------
export interface Promotion {
  id?: string;
  title: string;
  Barcode: string;
  products?: { barcode: string; quantity: number }[];
  title_normalized?: string;
  [key: string]: unknown;
}

export interface Sale {
  id?: string;
  total: number;
  timestamp: { seconds: number; nanoseconds: number };
  [key: string]: unknown;
}

export interface Expense {
  id?: string;
  date: string;
  amount: number;
  [key: string]: unknown;
}

export interface FirestoreDoc<T> {
  id: string;
  data: T;
}

// ---------------------- PRODUCTOS ----------------------

// Obtener todos los productos filtrando por título, categoría o barcode
export const getAll = async (
  searchTerm = "",
  category = "",
  barcode = ""
): Promise<FirestoreDoc<ProductoData>[]> => {
  const productsCollection = collection(db, "Productos");
  const conditions: ReturnType<typeof where>[] = [];

  const lowerCaseSearchTerm = searchTerm.toLowerCase().replace(/\s+/g, "");
  const lowerCaseCategory = category.toLowerCase().trim();

  if (lowerCaseSearchTerm) {
    conditions.push(
      where("title_normalized", ">=", lowerCaseSearchTerm),
      where("title_normalized", "<=", lowerCaseSearchTerm + "\uf8ff")
    );
  }
  if (lowerCaseCategory) {
    conditions.push(
      where("category_normalized", ">=", lowerCaseCategory),
      where("category_normalized", "<=", lowerCaseCategory + "\uf8ff")
    );
  }
  if (barcode) {
    conditions.push(where("Barcode", "==", barcode));
  }

  const q = query(productsCollection, ...conditions);
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => ({
    id: doc.id,
    data: doc.data() as ProductoData,
  }));
};

// Obtener productos para el carrusel
export const getCarousel = async (): Promise<
  FirestoreDoc<{ url: string }>[]
> => {
  const carouselCollection = collection(db, "CarouselImg");
  const querySnapshot = await getDocs(carouselCollection);
  return querySnapshot.docs.map((doc) => ({
    id: doc.id,
    data: doc.data() as { url: string },
  }));
};

// Obtener producto por ID
export const getById = async (
  id: string
): Promise<FirestoreDoc<ProductoData> | null> => {
  const productRef = doc(db, "Productos", id);
  const snapshot = await getDoc(productRef);
  return snapshot.exists()
    ? { id: snapshot.id, data: snapshot.data() as ProductoData }
    : null;
};

// Crear producto
export const create = async (data: ProductoData): Promise<string> => {
  const titleNormalized = data.title.toLowerCase().replace(/\s+/g, "");
  const categoryNormalized = data.category.toLowerCase().replace(/\s+/g, "");
  const dataWithNormalizedFields = {
    ...data,
    title_normalized: titleNormalized,
    category_normalized: categoryNormalized,
    dateAdded: new Date(),
  };
  const docRef = await addDoc(collection(db, "Productos"), dataWithNormalizedFields);
  return docRef.id;
};

// Actualizar producto
export const update = async (
  id: string,
  data: Partial<ProductoData>
): Promise<void> => {
  const titleNormalized = data.title
    ? data.title.toLowerCase().replace(/\s+/g, "")
    : undefined;
  const categoryNormalized = data.category
    ? data.category.toLowerCase().replace(/\s+/g, "")
    : undefined;

  const dataWithNormalizedFields = {
    ...data,
    ...(titleNormalized && { title_normalized: titleNormalized }),
    ...(categoryNormalized && { category_normalized: categoryNormalized }),
  };

  const productRef = doc(db, "Productos", id);
  await setDoc(productRef, dataWithNormalizedFields, { merge: true });
};

// Eliminar producto
export const remove = async (id: string): Promise<void> => {
  const productRef = doc(db, "Productos", id);
  await deleteDoc(productRef);
};

// ---------------------- BUSQUEDAS ----------------------

// ---------------------- BUSQUEDAS ----------------------

// Obtener producto por barcode
export const getProductByBarcode = async (
  barcode: string
): Promise<(FirestoreDoc<ProductoData> & { type: "product" | "promotion" }) | null> => {
  const productsCollection = collection(db, "Productos");
  const promoCollection = collection(db, "promociones");

  const productQuery = query(productsCollection, where("Barcode", "==", barcode));
  const promoQuery = query(promoCollection, where("Barcode", "==", barcode));

  const [productSnapshot, promoSnapshot] = await Promise.all([
    getDocs(productQuery),
    getDocs(promoQuery),
  ]);

  if (!productSnapshot.empty) {
    const doc = productSnapshot.docs[0];
    return { id: doc.id, data: doc.data() as ProductoData, type: "product" };
  } else if (!promoSnapshot.empty) {
    const doc = promoSnapshot.docs[0];
    return { id: doc.id, data: doc.data() as ProductoData, type: "promotion" };
  } else {
    return null;
  }
};

// Nueva función de búsqueda para lista de resultados
export const searchProductsAndPromos = async (
  title: string
): Promise<(FirestoreDoc<ProductoData> & { type: "product" | "promotion" })[]> => {
  const titleNormalized = title.toLowerCase().replace(/\s+/g, "");
  if (!titleNormalized) return [];

  const productsCollection = collection(db, "Productos");
  const promoCollection = collection(db, "promociones");

  // Prefix search on normalized title
  const productQuery = query(
    productsCollection,
    where("title_normalized", ">=", titleNormalized),
    where("title_normalized", "<=", titleNormalized + "\uf8ff")
  );

  const promoQuery = query(
    promoCollection,
    where("title_normalized", ">=", titleNormalized),
    where("title_normalized", "<=", titleNormalized + "\uf8ff")
  );

  const [productSnapshot, promoSnapshot] = await Promise.all([
    getDocs(productQuery),
    getDocs(promoQuery),
  ]);

  const products = productSnapshot.docs.map(doc => ({
    id: doc.id,
    data: doc.data() as ProductoData,
    type: "product" as const
  }));

  const promos = promoSnapshot.docs.map(doc => ({
    id: doc.id,
    data: doc.data() as ProductoData, // Promos should match product shape roughly or be handled
    type: "promotion" as const
  }));

  return [...products, ...promos];
};

// Legacy / Single Match (kept for compatibility but delegates logic if possible, or leave as is but fixed)
export const getProductByTitle = async (
  title: string
): Promise<(FirestoreDoc<ProductoData> & { type: "product" | "promotion" }) | null> => {
  // Use the new search logic but return first result
  const results = await searchProductsAndPromos(title);
  return results.length > 0 ? results[0] : null;
};

// ---------------------- PROMOCIONES ----------------------
export const createPromotion = async (promotion: Promotion): Promise<void> => {
  const titleNormalized = promotion.title.toLowerCase().replace(/\s+/g, "");
  const dataWithNormalizedFields = {
    ...promotion,
    title_normalized: titleNormalized,
  };

  const promoRef = doc(collection(db, "promociones"));
  await setDoc(promoRef, dataWithNormalizedFields);

  const productRef = doc(collection(db, "Productos"));
  await setDoc(productRef, dataWithNormalizedFields);
};

// ---------------------- STOCK ----------------------
export const updateProductStock = async (
  id: string,
  newStock: number
): Promise<void> => {
  const productRef = doc(db, "Productos", id);
  await updateDoc(productRef, { stock: newStock });
};

// ---------------------- VENTAS Y GASTOS ----------------------

// Agregar venta
export const addSale = async (sale: Sale): Promise<void> => {
  await addDoc(collection(db, "sales"), sale);
};

// Obtener ventas históricas
export const fetchSalesData = async (): Promise<{ date: string; total: number }[]> => {
  const salesCollection = collection(db, "sales");
  const querySnapshot = await getDocs(salesCollection);

  return querySnapshot.docs
    .map((doc) => {
      const data = doc.data() as Sale;
      const timestamp = data.timestamp;
      const saleDate = timestamp ? new Date(timestamp.seconds * 1000) : null;
      if (saleDate) saleDate.setHours(0, 0, 0, 0);

      return {
        date: saleDate ? saleDate.toISOString().split("T")[0] : "",
        total: Number(String(data.total).replace(/[^0-9.-]+/g, "")) || 0,
      };
    })
    .filter((sale) => sale.date !== "");
};

// Obtener gastos históricos
export const fetchExpensesData = async (): Promise<{ date: string; total: number }[]> => {
  const expensesCollection = collection(db, "expenses");
  const querySnapshot = await getDocs(expensesCollection);

  return querySnapshot.docs
    .map((doc) => {
      const data = doc.data() as Expense;
      const date = new Date(data.date);
      return {
        date: date.toISOString().split("T")[0],
        total: parseFloat(String(data.amount)) || 0,
      };
    })
    .filter((expense) => expense.date !== null);
};
