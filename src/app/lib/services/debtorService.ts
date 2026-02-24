import { isNative } from '../utils/environment';
import { getDatabase, IDBDebtor, IDBDebt } from '@/app/lib/services/LocalDatabase';
import { 
    collection, 
    getDocs, 
    setDoc, 
    doc, 
    updateDoc, 
    arrayUnion, 
} from 'firebase/firestore';
import { db } from '@/app/config/firebase';

export interface Debtor {
    id: string;
    name: string;
    totalAmount: number;
    debts: IDBDebt[];
    isClosed: boolean;
    createdAt?: Date;
}

export class DebtorService {
    private static instance: DebtorService;
    private constructor() {}

    static getInstance(): DebtorService {
        if (!DebtorService.instance) {
            DebtorService.instance = new DebtorService();
        }
        return DebtorService.instance;
    }

    /**
     * Obtiene todos los deudores
     */
    async getAll(): Promise<Debtor[]> {
        if (isNative()) {
            const database = await getDatabase();
            const raw = await database.getDebtors();
            return raw.map(d => ({
                id: d.id,
                name: d.name,
                totalAmount: d.totalAmount,
                isClosed: Boolean(d.isClosed),
                debts: Array.isArray(d.debts) ? d.debts : JSON.parse(d.debts as unknown as string || '[]'),
                createdAt: d.createdAt ? new Date(d.createdAt) : undefined
            }));
        } else {
            const snap = await getDocs(collection(db, "debtors"));
            return snap.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    name: data.name,
                    totalAmount: data.totalAmount || 0,
                    isClosed: data.isClosed || false,
                    debts: data.debts || [],
                    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date()
                };
            });
        }
    }

    /**
     * Agrega una deuda (crea deudor si no existe)
     */
    async addDebt(debtorName: string, amount: number, products: IDBDebt['products']): Promise<{ success: boolean; error?: string }> {
        const debt: IDBDebt = {
            amount,
            timestamp: Date.now(),
            products
        };

        if (isNative()) {
            try {
                const database = await getDatabase();
                const all = await database.getDebtors();
                const existing = all.find(d => d.name.toLowerCase() === debtorName.toLowerCase());

                if (existing) {
                    if (existing.isClosed) return { success: false, error: "Cuenta cerrada" };
                    const currentDebts = typeof existing.debts === 'string' ? JSON.parse(existing.debts) : existing.debts;
                    const updated: IDBDebtor = {
                        ...existing,
                        totalAmount: (existing.totalAmount || 0) + amount,
                        debts: [...currentDebts, debt],
                        synced: 0 // Mark as pending sync
                    };
                    await database.saveDebtor(updated);
                } else {
                    const newDebtor: IDBDebtor = {
                        id: `local_debtor_${Date.now()}`, // Temporary ID
                        name: debtorName,
                        totalAmount: amount,
                        debts: [debt],
                        isClosed: 0,
                        createdAt: Date.now(),
                        synced: 0
                    };
                    await database.saveDebtor(newDebtor);
                }
                
                return { success: true };
            } catch (e: unknown) {
                return { success: false, error: String(e) };
            }
        } else {
            try {
                const snap = await getDocs(collection(db, "debtors"));
                const existingDoc = snap.docs.find(d => d.data().name.toLowerCase() === debtorName.toLowerCase());
                
                if (existingDoc) {
                    const data = existingDoc.data();
                    if (data.isClosed) return { success: false, error: "Cuenta cerrada" };
                    
                    const docRef = doc(db, "debtors", existingDoc.id);
                    await updateDoc(docRef, {
                        debts: arrayUnion({ ...debt, timestamp: new Date() }), // Firestore prefers Date objects
                        totalAmount: (data.totalAmount || 0) + amount
                    });
                } else {
                    const docRef = doc(collection(db, "debtors"));
                    await setDoc(docRef, {
                        name: debtorName,
                        totalAmount: amount,
                        debts: [{ ...debt, timestamp: new Date() }],
                        createdAt: new Date(),
                        isClosed: false
                    });
                }
                return { success: true };
            } catch (e) {
                return { success: false, error: String(e) };
            }
        }
    }
}

export const debtorService = DebtorService.getInstance();
