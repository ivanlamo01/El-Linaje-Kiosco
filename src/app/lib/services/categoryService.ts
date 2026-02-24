import { isNative } from '../utils/environment';
import { collection, getDocs, addDoc, deleteDoc, doc, Timestamp, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { db } from '@/app/config/firebase';
import { getDatabase, IDBCategory } from '@/app/lib/services/LocalDatabase';

export class CategoryService {
    private static instance: CategoryService;

    private constructor() { }

    static getInstance(): CategoryService {
        if (!CategoryService.instance) {
            CategoryService.instance = new CategoryService();
        }
        return CategoryService.instance;
    }

    /**
     * Obtiene todas las categorías
     */
    async getAll(): Promise<IDBCategory[]> {
        if (isNative()) {
            return this.getAllFromLocalDB();
        } else {
            return this.getAllFromFirestore();
        }
    }

    private async getAllFromLocalDB(): Promise<IDBCategory[]> {
        const database = await getDatabase();
        return await database.getCategories();
    }

    private async getAllFromFirestore(): Promise<IDBCategory[]> {
        const categoriesRef = collection(db, 'Categorias');
        const snapshot = await getDocs(categoriesRef);

        return snapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => {
            const data = doc.data();
            return {
                id: doc.id,
                name: String(data.name || ""),
                createdAt: data.createdAt?.seconds ? data.createdAt.seconds * 1000 : undefined
            } as IDBCategory;
        });
    }

    /**
     * Agrega una categoría
     */
    async add(categoryData: { name: string }): Promise<{ success: boolean; id?: string; error?: string }> {
        if (isNative()) {
            const database = await getDatabase();
            // Para local generamos ID si no existe
            const id = 'cat_' + Date.now();
            const newCat: IDBCategory = {
                id,
                name: categoryData.name,
                createdAt: Date.now()
            };
            
            const res = await database.addCategory(newCat);
            if (res.success) {
                return { success: true, id };
            }
            return { success: false, error: 'Failed to save locally' };
        } else {
            try {
                const docRef = await addDoc(collection(db, 'Categorias'), {
                    ...categoryData,
                    createdAt: Timestamp.now()
                });
                return { success: true, id: docRef.id };
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                return { success: false, error: errorMessage };
            }
        }
    }

    /**
     * Elimina una categoría
     */
    async delete(id: string): Promise<{ success: boolean; error?: string }> {
        if (isNative()) {
            const database = await getDatabase();
            const res = await database.deleteCategory(id);
            return res;
        } else {
            try {
                await deleteDoc(doc(db, 'Categorias', id));
                return { success: true };
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                return { success: false, error: errorMessage };
            }
        }
    }

    /**
     * Sincroniza categorías desde Firestore a SQLite
     */
    async syncFromFirestore(): Promise<{ success: boolean; count: number }> {
        try {
            const categories = await this.getAllFromFirestore();
            if (categories.length === 0) return { success: true, count: 0 };

            const database = await getDatabase();
            const res = await database.syncCategories(categories);
            return res;
        } catch (error: unknown) {
            console.error('Error syncing categories:', error);
            return { success: false, count: 0 };
        }
    }
}

export const categoryService = CategoryService.getInstance();
