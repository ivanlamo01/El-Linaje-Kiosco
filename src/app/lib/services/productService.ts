import { isNative, isOnline } from '../utils/environment';
import { collection, getDocs, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '@/app/config/firebase';
import { getDatabase, IDBProduct } from '@/app/lib/services/LocalDatabase';

export interface Product {
    id: string;
    name?: string;
    title?: string;
    price: number;
    stock: number;
    category?: string;
    description?: string;
    Barcode?: string;
}

/**
 * Servicio Unificado de Productos
 * Automáticamente usa SQLite (Electron/Mobile) o Firestore (Web)
 */
export class ProductService {
    private static instance: ProductService;

    private constructor() { }

    static getInstance(): ProductService {
        if (!ProductService.instance) {
            ProductService.instance = new ProductService();
        }
        return ProductService.instance;
    }

    /**
     * Obtiene todos los productos
     */
    async getAll(): Promise<Product[]> {
        if (isNative()) {
            return this.getAllFromLocalDB();
        } else {
            return this.getAllFromFirestore();
        }
    }

    private async getAllFromLocalDB(): Promise<Product[]> {
        const database = await getDatabase();

        const products = await database.getProducts();

        // Mapear campos de SQLite a la interfaz Product de la UI
        const mapped: Product[] = products.map((p) => {
            const raw = p as unknown as { name?: string; title?: string; Barcode?: string; description?: string };

            return {
                id: p.id,
                title: p.title || p.name || raw.name || '',

                name: p.name || p.title || raw.title || '',
                price: p.price,
                stock: p.stock,
                category: p.category || '',
                // Mapear 'Barcode' (Electron) o 'barcode' (Capacitor) a 'Barcode' (Product)
                Barcode: p.barcode || raw.Barcode || '',
                description: raw.description || '',
            };
        });

        return mapped;
    }

    /**
     * Obtiene productos desde Firestore (Web)
     */
    private async getAllFromFirestore(): Promise<Product[]> {
        try {
            const productsRef = collection(db, 'Productos');
            const snapshot = await getDocs(productsRef);

            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Product[];
        } catch (error) {
            console.error('[ProductService] Firestore getAll error:', error);
            return [];
        }
    }

    /**
     * Sube productos pendientes de SQLite a Firestore
     */
    async syncPendingProducts(): Promise<{ success: boolean; count?: number; error?: string }> {
        if (!isNative()) return { success: false, error: 'Not Native' };

        const online = await isOnline();
        if (!online) return { success: false, error: 'Offline' };

        try {
            console.log('[ProductService] Checking for pending products...');
            const database = await getDatabase();
            
            if (!database.getPendingProducts) {
                 return { success: false, error: 'Method not implemented' };
            }

            const pendingProducts = await database.getPendingProducts();

            if (pendingProducts.length === 0) {
                return { success: true, count: 0 };
            }

            console.log(`[ProductService] Found ${pendingProducts.length} pending products. Syncing...`);
            
            let syncedCount = 0;

            for (const p of pendingProducts) {
                try {
                    // Cast to any to access raw 'Barcode' property if it exists
                    const rawP = p as any; 
                    const productData = {
                        name: p.name || p.title || '',
                        title: p.title || p.name || '',
                        price: p.price,
                        stock: p.stock,
                        category: p.category || '',
                        Barcode: p.barcode || rawP.Barcode || '', 
                        description: '' 
                    };

                    // Add to Firestore
                    const docRef = await addDoc(collection(db, 'Productos'), productData);
                    
                    // Delete local pending product (it will be re-downloaded with real ID)
                    await database.deleteProduct(p.id);
                    
                    syncedCount++;
                } catch (err) {
                     console.error(`[ProductService] Failed to sync product ${p.id}`, err);
                }
            }
            
            if (syncedCount > 0) {
                await this.syncFromFirestore();
            }

            return { success: true, count: syncedCount };

        } catch (error) {
             console.error('[ProductService] Sync error:', error);
             return { success: false, error: (error as Error).message };
        }
    }

    /**
     * Sincroniza productos de Firestore a SQLite
     * (Solo se ejecuta en Electron/Mobile cuando hay internet)
     */
    async syncFromFirestore(): Promise<{ success: boolean; count?: number; error?: string }> {
        if (!isNative()) {
            return { success: false, error: 'Not in Native environment' };
        }

        const online = await isOnline();
        if (!online) {
            return { success: false, error: 'No internet connection' };
        }

        try {
            console.log('[ProductService] Syncing products from Firestore...');

            // Obtener productos de Firestore
            const products = await this.getAllFromFirestore();

            // Guardar en SQLite
            const database = await getDatabase();

            const dbProducts: IDBProduct[] = products.map(p => ({
                id: p.id,
                title: p.title || p.name || '',
                price: p.price,
                stock: p.stock,
                category: p.category,
                barcode: p.Barcode,
                image: '',
                name: p.name || p.title
            }));

            const result = await database.syncProducts(dbProducts);

            // LocalDatabase wrapper returns { success: true, count... } usually
            // or verifies result

            return { success: true, count: products.length };

        } catch (error) {
            console.error('[ProductService] Sync error:', error);
            return { success: false, error: (error as Error).message };
        }
    }

    /**
     * Agrega un nuevo producto
     * En Native: guarda en SQLite (marcado como pending)
     * En Web: guarda directo en Firestore
     */
    async add(product: Omit<Product, 'id'>): Promise<{ success: boolean; id?: string; error?: string }> {
        if (isNative()) {
            try {
                const database = await getDatabase();
                const tempId = 'local_' + Date.now();

                const dbProd: IDBProduct = {
                    id: tempId,
                    title: product.title || product.name || '',
                    price: product.price,
                    stock: product.stock,
                    category: product.category,
                    barcode: product.Barcode,
                    name: product.name || product.title
                };

                await database.addProduct(dbProd);

                // Try to sync immediately if online
                isOnline().then(online => {
                    if (online) {
                        this.syncPendingProducts().catch(err => console.error("Error auto-syncing product:", err));
                    }
                });

                return { success: true, id: tempId };
            } catch (e) {
                return { success: false, error: (e as Error).message };
            }
        } else {
            try {
                const docRef = await addDoc(collection(db, 'Productos'), product);
                return { success: true, id: docRef.id };
            } catch (error) {
                return { success: false, error: (error as Error).message };
            }
        }
    }

    /**
     * Actualiza el stock de un producto
     */
    async updateStock(id: string, newStock: number): Promise<{ success: boolean; error?: string }> {
        if (isNative()) {
            const database = await getDatabase();
            const res = await database.updateStock(id, newStock);
            return { success: true };
        } else {
            try {
                const productRef = doc(db, 'Productos', id);
                await updateDoc(productRef, { stock: newStock });
                return { success: true };
            } catch (error) {
                return { success: false, error: (error as Error).message };
            }
        }
    }
    /**
     * Actualiza un producto completo o parcial
     */
    async update(id: string, data: Partial<Product>): Promise<{ success: boolean; error?: string }> {
        if (isNative()) {
            try {
                const database = await getDatabase();

                const currentProducts = await database.getProducts();
                const current = currentProducts.find(p => p.id === id);

                if (!current) {
                    throw new Error('Product not found locally');
                }

                const productToSave: IDBProduct = {
                    ...current,
                    title: data.title || data.name || current.title,
                    price: data.price ?? current.price,
                    stock: data.stock ?? current.stock,
                    barcode: data.Barcode || current.barcode,
                    category: data.category || current.category,
                    name: data.name || data.title || current.name
                };

                await database.addProduct(productToSave);
                return { success: true };

            } catch (e) {
                return { success: false, error: (e as Error).message };
            }
        } else {
            try {
                const productRef = doc(db, 'Productos', id);
                await updateDoc(productRef, data);
                return { success: true };
            } catch (error) {
                return { success: false, error: (error as Error).message };
            }
        }
    }

    async delete(id: string): Promise<{ success: boolean; error?: string }> {
        if (isNative()) {
            try {
                const database = await getDatabase();
                await database.deleteProduct(id);
                return { success: true };
            } catch (e) {
                return { success: false, error: (e as Error).message };
            }
        } else {
            try {
                const { deleteDoc } = await import('firebase/firestore');
                await deleteDoc(doc(db, 'Productos', id));
                return { success: true };
            } catch (error) {
                return { success: false, error: (error as Error).message };
            }
        }
    }
}

// Exportar instancia singleton
export const productService = ProductService.getInstance();
