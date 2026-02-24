import {  isOnline, isNative } from '../utils/environment';
import { getDatabase, IDBSale, IDBSaleItem } from '@/app/lib/services/LocalDatabase';
import type { QueryDocumentSnapshot, DocumentData, Timestamp } from 'firebase/firestore'; 
import { Sale, FirestoreSale, FirestoreProduct, Product } from '@/app/types/saleTypes';

export interface SaleData {
    total: number;
    items: Product[];
    paymentMethod: string;

}

/**
 * Servicio Unificado de Ventas
 */
export class SaleService {
    private static instance: SaleService;

    private constructor() { }

    static getInstance(): SaleService {
        if (!SaleService.instance) {
            SaleService.instance = new SaleService();
        }
        return SaleService.instance;
    }

    /**
     * Guarda una venta
     * En Native: guarda en SQLite (marcado como pending para sync)
     * En Web: guarda directo en Firestore (a través de tu API)
     */
    async save(saleData: SaleData): Promise<{ success: boolean; id?: string; error?: string }> {
        if (isNative()) {
            return this.saveToLocalDB(saleData);
        } else {
            return this.saveToFirestore(saleData);
        }
    }

    private async saveToLocalDB(saleData: SaleData): Promise<{ success: boolean; id?: string; error?: string }> {
        try {
            const database = await getDatabase();
            const result = await database.saveSale({
                ...saleData,
                items: saleData.items as unknown as IDBSaleItem[]
            });
            
            // Attempt immediate sync safely in the background
            isOnline().then(online => {
                if (online) {
                    console.log('[SaleService] Online: Attempting to sync pending sales immediately...');
                    this.syncPendingSales().then(res => {
                        console.log('[SaleService] Immediate sync result:', res);
                    }).catch(err => {
                        console.error('[SaleService] Immediate sync failed:', err);
                    });
                }
            });

            return { success: true, id: result.id?.toString() };
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return { success: false, error: errorMessage };
        }
    }

    private async saveToFirestore(saleData: SaleData): Promise<{ success: boolean; id?: string; error?: string }> {
        try {
            const { collection, addDoc } = await import('firebase/firestore');
            const { db } = await import('@/app/config/firebase');

            // Adaptar datos al formato que usa la app actualmente en Firestore
            const sale = {
                total: String(saleData.total),
                products: saleData.items, // Asumimos que items ya viene con la estructura correcta o se guarda directo
                paymentMethod: saleData.paymentMethod,
                timestamp: new Date(),
            };

            const docRef = await addDoc(collection(db, 'sales'), sale);
            return { success: true, id: docRef.id };
        } catch (error: unknown) {
            console.error('[SaleService] Firestore save error:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            return { success: false, error: errorMessage };
        }
    }
    /**
     * Obtiene ventas por rango de fechas
     */
    async getByRange(start: Date, end: Date): Promise<{ success: boolean; data?: Sale[]; error?: string }> {
        if (isNative()) {
            const database = await getDatabase();
            // Convert dates to timestamps (ms) for SQLite query
            const raw = await database.getSalesByRange(start.getTime(), end.getTime());
            
            // Normalize result and map to Sale type
            const rawList = (Array.isArray(raw) ? raw : ((raw as { data: IDBSale[] }).data || [])) as (IDBSale & { timestamp?: number })[];
            const data: Sale[] = rawList.map((item) => {
                const ts = item.timestamp ?? (item.date ? new Date(item.date).getTime() : 0);
                return {
                    id: String(item.id),
                    total: Number(item.total),
                    paymentMethod: item.payment_method || item.paymentMethod,
                    products: (item.items as unknown as Product[]) || [],
                    // Mock Firestore Timestamp for compatibility in native mode
                    date: {
                        seconds: Math.floor(ts / 1000),
                        nanoseconds: (ts % 1000) * 1000000,
                        toDate: () => new Date(ts),
                        toMillis: () => ts
                    } as unknown as Timestamp
                };
            });

            return { success: true, data };
        } else {
            try {
                const { collection, getDocs, query, where, orderBy, Timestamp } = await import('firebase/firestore');
                const { db } = await import('@/app/config/firebase');

                const startTS = Timestamp.fromDate(start);
                const endTS = Timestamp.fromDate(end);

                const salesRef = collection(db, "sales");
                const q = query(
                    salesRef,
                    where("timestamp", ">=", startTS),
                    where("timestamp", "<=", endTS),
                    orderBy("timestamp", "asc")
                );

                const snapshot = await getDocs(q);

                const sales = snapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => {
                    const data = doc.data() as FirestoreSale;

                    const products = (data.products ?? []).map((p: FirestoreProduct) => ({
                        title: p.title ?? "",
                        description: p.description ?? "",
                        price: Number(p.price) || 0,
                        quantity: Number(p.quantity) || 1,
                    }));

                    return {
                        id: doc.id,
                        total: Number(data.total) || 0,
                        date: data.timestamp, // Firestore Timestamp object
                        paymentMethod: data.paymentMethod ?? "Desconocido",
                        products,
                        facturaId: (data as any).facturaId || null // Ensure this is mapped!
                    };
                });

                return { success: true, data: sales };

            } catch (error: unknown) {
                console.error('[SaleService] Firestore getByRange error:', error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                return { success: false, error: errorMessage };
            }
        }
    }

    /**
     * Obtiene las últimas N ventas
     */
    async getLast(limitCount: number = 20): Promise<{ success: boolean; data?: Sale[]; error?: string }> {
        if (isNative()) {
            return { success: false, error: "Native implementation of getLast not ready" };
        } else {
            try {
                const { collection, getDocs, query, orderBy, limit } = await import('firebase/firestore');
                const { db } = await import('@/app/config/firebase');

                const salesRef = collection(db, "sales");
                const q = query(
                    salesRef,
                    orderBy("timestamp", "desc"),
                    limit(limitCount)
                );

                const snapshot = await getDocs(q);

                const sales = snapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => {
                    const data = doc.data() as FirestoreSale;

                    const products = (data.products ?? []).map((p: FirestoreProduct) => ({
                        title: p.title ?? "",
                        description: p.description ?? "",
                        price: Number(p.price) || 0,
                        quantity: Number(p.quantity) || 1,
                    }));

                    return {
                        id: doc.id,
                        total: Number(data.total) || 0,
                        date: data.timestamp,
                        paymentMethod: data.paymentMethod ?? "Desconocido",
                        products,
                        facturaId: (data as any).facturaId || null // Ensure this is mapped!
                    };
                });

                return { success: true, data: sales };
            } catch (error: unknown) {
                console.error('[SaleService] Firestore getLast error:', error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                return { success: false, error: errorMessage };
            }
        }
    }

    /**
     * Elimina una venta
     */
    async delete(id: string): Promise<{ success: boolean; error?: string }> {
        if (isNative()) {
            // No implementado para local db por ahora
            return { success: false, error: "Delete not implemented for local DB yet" };
        } else {
            try {
                const { doc, deleteDoc } = await import('firebase/firestore');
                const { db } = await import('@/app/config/firebase');
                await deleteDoc(doc(db, 'sales', id));
                return { success: true };
            } catch (error: unknown) {
                console.error('[SaleService] Firestore delete error:', error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                return { success: false, error: errorMessage };
            }
        }
    }

    async syncPendingSales(): Promise<{ success: boolean; count?: number; error?: string }> {
        if (!isNative()) return { success: false, error: 'Not Native' };

        const online = await isOnline();
        if (!online) return { success: false, error: 'Offline' };

        try {
            console.log('[SaleService] Checking for pending sales...');
            const database = await getDatabase();
            const rawResult = await database.getPendingSales();
            
            const pendingSales = (Array.isArray(rawResult) ? rawResult : ((rawResult as { data: IDBSale[] }).data || [])) as (IDBSale & { timestamp?: number | string })[];

            if (pendingSales.length === 0) {
                return { success: true, count: 0 };
            }

            console.log(`[SaleService] Found ${pendingSales.length} pending sales. Syncing...`);

            const { collection, addDoc } = await import('firebase/firestore');
            const { db } = await import('@/app/config/firebase');

            let syncedCount = 0;

            for (const sale of pendingSales) {
                try {
                    // 1. Subir a Firestore
                    // El objeto items ya viene parseado de la DB local usualmente
                    // Ajustar estructura para Firestore
                    const docData = {
                        total: String(sale.total),
                        products: sale.items, 
                        paymentMethod: sale.payment_method || sale.paymentMethod, // Handle both snake_case (sqlite) and camelCase
                        timestamp: new Date(sale.timestamp || sale.date), // SQLite guarda ms o string iso
                        syncedFromElectron: true
                    };

                    const docRef = await addDoc(collection(db, 'sales'), docData);

                    // 2. Marcar como synced en SQLite
                    await database.markSaleSynced(sale.id, docRef.id);
                    syncedCount++;

                } catch (innerError) {
                    console.error(`[SaleService] Failed to sync sale ${sale.id}`, innerError);
                }
            }

            return { success: true, count: syncedCount };

        } catch (error: unknown) {
            console.error('[SaleService] Sync error:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            return { success: false, error: errorMessage };
        }
    }


    async syncFromFirestore(): Promise<{ success: boolean; count?: number; error?: string }> {
        if (!isNative()) return { success: false, error: 'Not Native' };

        const online = await isOnline();
        if (!online) return { success: false, error: 'Offline' };

        try {
            console.log('[SaleService] Syncing sales FROM Firestore...');

            const { collection, getDocs, query, where, orderBy, Timestamp, } = await import('firebase/firestore');
            const { db } = await import('@/app/config/firebase');

            const daysAgo = new Date();
            daysAgo.setMonth(daysAgo.getMonth() - 6); // Últimos 6 meses
            const startTS = Timestamp.fromDate(daysAgo);

            console.log(`[SaleService] Fetching sales history from: ${daysAgo.toLocaleString()}`);

            const salesRef = collection(db, "sales");
            // Ordenar por timestamp asec
            const q = query(
                salesRef,
                where("timestamp", ">=", startTS),
                orderBy("timestamp", "asc")
            );

            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                return { success: true, count: 0 };
            }

            // Mapear al formato que espera SQLite (SaleData plano)
            const salesToSync = snapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => {
                const data = doc.data() as FirestoreSale;
                return {
                    id: doc.id,
                    total: Number(data.total) || 0,
                    products: (data.products ?? []) as unknown as IDBSaleItem[], // Casting to match IDBSyncSale structure which accepts IDBSaleItem[]
                    paymentMethod: data.paymentMethod ?? "Desconocido",
                    timestamp: data.timestamp?.toMillis() || Date.now() // Convert Firebase Timestamp to ms
                };
            });
            
            const database = await getDatabase();

            const result = await database.syncSales ? await database.syncSales(salesToSync) : { success: false, error: "Not implemented" };

            if (result.success && 'count' in result) {
                console.log(`[SaleService] Downloaded ${result.count} sales from Firestore.`);
            }

            return result;

        } catch (error: unknown) {
            console.error('[SaleService] Download sync error:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            return { success: false, error: errorMessage };
        }
    }
}

export const saleService = SaleService.getInstance();
