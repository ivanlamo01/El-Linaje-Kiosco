import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';

export interface IDBProduct {
    id: string;
    title: string;
    price: number;
    stock: number;
    barcode?: string;
    category?: string;
    image?: string;
    last_updated?: string;
    name?: string; 
}

export interface IDBSaleItem {
    [key: string]: unknown;
}

export interface IDBSaleInput {
    total: number;
    items: IDBSaleItem[];
    paymentMethod: string;
    date?: string;
    timestamp?: number;
}

export interface IDBSale {
    id: number;
    date: string | number;
    total: number;
    items: IDBSaleItem[];
    paymentMethod: string;
    synced: number;
    firebaseId?: string;
    payment_method?: string; // Raw column name
}

export interface IDBSyncSale {
    id: string;
    total: number;
    products: IDBSaleItem[] | string;
    paymentMethod: string;
    timestamp: number;
}

export interface IDBCategory {
    id: string;
    name: string;
    createdAt?: number;
}

export interface IDBDebt {
    amount: number;
    timestamp: string | number;
    products: IDBSaleItem[];
}

export interface IDBDebtor {
    id: string;
    name: string;
    totalAmount: number;
    debts: IDBDebt[] | string; // string for SQLite storage
    isClosed: number | boolean; // INTEGER 1/0 for SQLite
    createdAt?: string | number;
    synced?: number; // 0 pending, 1 synced
}

// Definimos la interfaz que cumple tanto Electron como Capacitor
export interface DatabaseService {
    getProducts: () => Promise<IDBProduct[]>;
    saveSale: (saleData: IDBSaleInput) => Promise<{ success: boolean; id?: string | number; error?: string }>;
    addProduct: (product: IDBProduct) => Promise<{ success: boolean; id?: string; error?: string } | IDBProduct>;
    syncProducts: (products: IDBProduct[]) => Promise<{ success: boolean; count: number }>;
    getPendingProducts?: () => Promise<IDBProduct[]>;
    updateStock: (id: string, newStock: number) => Promise<{ success: boolean }>;
    deleteProduct: (id: string) => Promise<{ success: boolean }>;
    
    // Categorías
    getCategories: () => Promise<IDBCategory[]>;
    addCategory: (category: IDBCategory) => Promise<{ success: boolean }>;
    deleteCategory: (id: string) => Promise<{ success: boolean }>;
    syncCategories: (categories: IDBCategory[]) => Promise<{ success: boolean; count: number }>;

    // Deudores
    getDebtors: () => Promise<IDBDebtor[]>;
    saveDebtor: (debtor: IDBDebtor) => Promise<{ success: boolean }>;
    syncDebtors: (debtors: IDBDebtor[]) => Promise<{ success: boolean; count: number }>;

    getPendingSales: () => Promise<IDBSale[]>;
    getSalesByRange: (start: number | string, end: number | string) => Promise<IDBSale[]>;
    markSaleSynced: (id: number, firebaseId: string) => Promise<{ success: boolean }>;
    syncSales: (sales: IDBSyncSale[]) => Promise<{ success: boolean; count: number }>;
    getLastSaleTimestamp: () => Promise<string | null>;
    initialize?: () => Promise<void>;
}


// Tipado para el objeto global window.electron
declare global {
    interface Window {
        electron?: {
            db: DatabaseService;
            afip?: {
                crearFacturaC: (data: {
                    importe: number;
                    concepto: number;
                    docTipo: number;
                    docNro: number;
                    cbteTipo?: number;
                }) => Promise<{ success: boolean; data?: unknown; error?: string }>;
            };
        };
    }
}

// Implementación para Electron (Wrapper)
const electronDB: DatabaseService = {
    getProducts: async () => {
        if (typeof window !== 'undefined' && window.electron) {
            const res = await window.electron.db.getProducts() as unknown as { success: boolean; data: IDBProduct[] };
            // Cast to any because the window.electron type signature assumes DatabaseService (Project[]) 
            // but the actual IPC returns {success, data}.
            return res && res.success ? (res.data as IDBProduct[]) : [];
        }
        return [];
    },
    saveSale: async (saleData) => window.electron!.db.saveSale(saleData),
    addProduct: async (product) => window.electron!.db.addProduct(product),
    syncProducts: async (products) => window.electron!.db.syncProducts(products),
    getPendingProducts: async () => {
        if (!window.electron?.db.getPendingProducts) return [];
        const res = await window.electron.db.getPendingProducts() as unknown as { success: boolean; data: IDBProduct[] };
        return res && res.success ? (res.data as IDBProduct[]) : [];
    },
    updateStock: async (id, newStock) => window.electron!.db.updateStock(id, newStock),
    deleteProduct: async (id) => window.electron!.db.deleteProduct(id),
    
    // Categorías
    getCategories: async () => {
        const res = await window.electron!.db.getCategories() as unknown as { success: boolean; data: IDBCategory[] };
        return res && res.success ? res.data : [];
    },
    addCategory: async (category) => window.electron!.db.addCategory(category),
    deleteCategory: async (id) => window.electron!.db.deleteCategory(id),
    syncCategories: async (categories) => window.electron!.db.syncCategories(categories),

    // Deudores
    getDebtors: async () => {
        if (!window.electron) return [];
        const res = await window.electron.db.getDebtors() as unknown as { success: boolean; data: IDBDebtor[] };
        return res && res.success ? res.data : [];
    },
    saveDebtor: async (d) => window.electron!.db.saveDebtor(d),
    syncDebtors: async (d) => ({ success: true, count: 0 }), // TODO: Implement IPC sync

    getPendingSales: async () => window.electron!.db.getPendingSales(),
    getSalesByRange: async (start, end) => window.electron!.db.getSalesByRange(start, end),
    markSaleSynced: async (id, firebaseId) => window.electron!.db.markSaleSynced(id, firebaseId),
    syncSales: async (sales) => window.electron!.db.syncSales(sales),
    getLastSaleTimestamp: async () => window.electron!.db.getLastSaleTimestamp(),
};

// Implementación para Capacitor (Android/iOS)
class CapacitorDB implements DatabaseService {
    private sqlite: SQLiteConnection;
    private db: SQLiteDBConnection | null = null;

    constructor() {
        this.sqlite = new SQLiteConnection(CapacitorSQLite);
    }

    async initialize() {
        if (this.db) return;

        try {
            console.log('Initializing Capacitor SQLite...');
            this.db = await this.sqlite.createConnection('el_linaje_kiosko', false, 'no-encryption', 1, false);
            
            await this.db.open();

            const schema = `
                CREATE TABLE IF NOT EXISTS products (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    price REAL NOT NULL,
                    stock INTEGER DEFAULT 0,
                    barcode TEXT,
                    category TEXT,
                    image TEXT,
                    last_updated TEXT
                );

                CREATE TABLE IF NOT EXISTS categories (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    createdAt INTEGER
                );

                CREATE TABLE IF NOT EXISTS sales (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date TEXT NOT NULL,
                    total REAL NOT NULL,
                    items TEXT NOT NULL,
                    paymentMethod TEXT,
                    synced INTEGER DEFAULT 0,
                    firebaseId TEXT
                );

                CREATE TABLE IF NOT EXISTS debtors (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    totalAmount REAL DEFAULT 0,
                    debts TEXT, 
                    isClosed INTEGER DEFAULT 0,
                    createdAt TEXT,
                    synced INTEGER DEFAULT 1
                );
            `;
            
            await this.db.execute(schema);
            console.log('Capacitor DB Initialized');
        } catch (err) {
            console.error('Error initializing Capacitor DB:', err);
        }
    }

    async getProducts(): Promise<IDBProduct[]> {
        if (!this.db) await this.initialize();
        const res = await this.db!.query('SELECT * FROM products');
        return (res.values as IDBProduct[]) || [];
    }

    async saveSale(saleData: IDBSaleInput) {
        if (!this.db) await this.initialize();
        const query = `INSERT INTO sales (date, total, items, paymentMethod, synced) VALUES (?, ?, ?, ?, 0)`;
        // Store timestamp (number) instead of ISO string for consistent range querying
        const timestamp = saleData.timestamp || Date.now();
        const values = [
            timestamp,
            saleData.total,
            JSON.stringify(saleData.items), // SQLite no soporta arrays/json nativos fácil
            saleData.paymentMethod
        ];
        
        const res = await this.db!.run(query, values);
        if (res.changes && res.changes.lastId) {
             return { success: true, id: res.changes.lastId };
        }
        
        // Fallback: Query max id if lastId not returned
        const rowIdRes = await this.db!.query("SELECT MAX(id) as id FROM sales");
        const id = rowIdRes.values?.[0]?.id;
        
        return { success: true, id: id };
    }

    async addProduct(product: IDBProduct) {
        if (!this.db) await this.initialize();
        const query = `
            INSERT OR REPLACE INTO products (id, title, price, stock, barcode, category, image, last_updated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
            product.id,
            product.title,
            product.price,
            product.stock || 0,
            product.barcode || '',
            product.category || '',
            product.image || '',
            new Date().toISOString()
        ];
        await this.db!.run(query, values);
        return product;
    }

    async syncProducts(products: IDBProduct[]) {
        if (!this.db) await this.initialize();
        
        // Use batch execution or transaction for performance
        // Simplest way: loop (slow but works) or constructed batch query
        // Let's use a transaction if possible or just standard calls
        
        for (const p of products) {
            await this.addProduct(p);
        }
        return { success: true, count: products.length };
    }

    async updateStock(id: string, newStock: number) {
        if (!this.db) await this.initialize();
        await this.db!.run('UPDATE products SET stock = ? WHERE id = ?', [newStock, id]);
        return { success: true };
    }

    async deleteProduct(id: string) {
        if (!this.db) await this.initialize();
        await this.db!.run('DELETE FROM products WHERE id = ?', [id]);
        return { success: true };
    }

    async getCategories(): Promise<IDBCategory[]> {
        if (!this.db) await this.initialize();
        const res = await this.db!.query('SELECT * FROM categories ORDER BY name ASC');
        return (res.values as IDBCategory[]) || [];
    }

    async addCategory(category: IDBCategory) {
        if (!this.db) await this.initialize();
        const query = `INSERT OR REPLACE INTO categories (id, name, createdAt) VALUES (?, ?, ?)`;
        await this.db!.run(query, [category.id, category.name, category.createdAt || Date.now()]);
        return { success: true };
    }

    async deleteCategory(id: string) {
        if (!this.db) await this.initialize();
        await this.db!.run('DELETE FROM categories WHERE id = ?', [id]);
        return { success: true };
    }

    async syncCategories(categories: IDBCategory[]) {
        if (!this.db) await this.initialize();
        for (const cat of categories) {
            await this.addCategory(cat);
        }
        return { success: true, count: categories.length };
    }

    // --- DEBTORS ---
    async getDebtors(): Promise<IDBDebtor[]> {
        if (!this.db) await this.initialize();
        const res = await this.db!.query('SELECT * FROM debtors ORDER BY name ASC');
        const list = (res.values as Record<string, unknown>[]) || [];
        return list.map(d => ({
            ...d,
            debts: typeof d.debts === 'string' ? JSON.parse(d.debts) : []
        })) as IDBDebtor[];
    }

    async saveDebtor(debtor: IDBDebtor) {
        if (!this.db) await this.initialize();
        const query = `
            INSERT OR REPLACE INTO debtors (id, name, totalAmount, debts, isClosed, createdAt, synced)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const debtsStr = typeof debtor.debts === 'string' ? debtor.debts : JSON.stringify(debtor.debts || []);
        const createdAt = debtor.createdAt || new Date().toISOString();
        // If synced is undefined, assume we are saving a LOCAL change, so synced=0. 
        // But if we call this from syncDebtors, we pass synced=1
        const syncedVal = debtor.synced !== undefined ? debtor.synced : 0; 
        
        await this.db!.run(query, [
            debtor.id, 
            debtor.name, 
            debtor.totalAmount, 
            debtsStr, 
            debtor.isClosed ? 1 : 0, 
            createdAt,
            syncedVal
        ]);
        return { success: true };
    }

    async syncDebtors(debtors: IDBDebtor[]) {
        if (!this.db) await this.initialize();
        for (const deb of debtors) {
            await this.saveDebtor({ ...deb, synced: 1 });
        }
        return { success: true, count: debtors.length };
    }

    async syncSales(sales: IDBSyncSale[]) {
        if (!this.db) await this.initialize();
        if (sales.length === 0) return { success: true, count: 0 };
        
        // We use firebaseId to check existence, since 'id' is mostly local auto-increment
        // sales array comes from Firestore, so 'id' property is the Firestore ID.
        
        for (const s of sales) {
             const check = await this.db!.query('SELECT id FROM sales WHERE firebaseId = ?', [s.id]);
             
             const itemsStr = typeof s.products === 'string' ? s.products : JSON.stringify(s.products || []);
             const dateVal = s.timestamp || Date.now();

             if (check.values && check.values.length > 0) {
                 // Update
                 await this.db!.run(`
                    UPDATE sales 
                    SET date = ?, total = ?, items = ?, paymentMethod = ?, synced = 1
                    WHERE firebaseId = ?
                 `, [dateVal, s.total, itemsStr, s.paymentMethod, s.id]);
             } else {
                 // Insert
                 await this.db!.run(`
                    INSERT INTO sales (date, total, items, paymentMethod, synced, firebaseId)
                    VALUES (?, ?, ?, ?, 1, ?)
                 `, [dateVal, s.total, itemsStr, s.paymentMethod, s.id]);
             }
        }
        return { success: true, count: sales.length };
    }

    async getPendingSales(): Promise<IDBSale[]> {
        if (!this.db) await this.initialize();
        const res = await this.db!.query('SELECT * FROM sales WHERE synced = 0');
        const sales = (res.values as Record<string, unknown>[]) || [];
        return sales.map((s) => {
            const items = typeof s.items === 'string' ? JSON.parse(s.items) : [];
            return {
                ...s,
                items
            } as unknown as IDBSale;
        });
    }

    async getSalesByRange(start: number | string, end: number | string): Promise<IDBSale[]> {
        if (!this.db) await this.initialize();
        const res = await this.db!.query('SELECT * FROM sales WHERE date BETWEEN ? AND ? ORDER BY date DESC', [start, end]);
        const sales = (res.values as Record<string, unknown>[]) || [];
        return sales.map((s) => {
            const items = typeof s.items === 'string' ? JSON.parse(s.items) : [];
            return {
                ...s,
                items
            } as unknown as IDBSale;
        });
    }

    async markSaleSynced(id: number, firebaseId: string) {
        if (!this.db) await this.initialize();
        await this.db!.run('UPDATE sales SET synced = 1, firebaseId = ? WHERE id = ?', [firebaseId, id]);
        return { success: true };
    }

    async getLastSaleTimestamp() {
        if (!this.db) await this.initialize();
        const res = await this.db!.query('SELECT MAX(date) as lastDate FROM sales');
        return res.values?.[0]?.lastDate || null;
    }
}

// Singleton export
let dbInstance: DatabaseService;

export const getDatabase = async (): Promise<DatabaseService> => {
    if (dbInstance) return dbInstance;

    // Detectar plataforma
    const isElectron = typeof window !== 'undefined' && window.electron;
    
    if (isElectron) {
        dbInstance = electronDB;
    } else if (Capacitor.getPlatform() === 'android' || Capacitor.getPlatform() === 'ios') {
        const capDb = new CapacitorDB();
        await capDb.initialize();
        dbInstance = capDb;
    } else {
        // Fallback para Web (Memoria o Error)
        console.warn('Web platform detected: No local DB. Using Mock/Memory or Firebase directly.');
        // Podríamos retornar una implementación dummy
         dbInstance = {
            getProducts: async () => [],
            saveSale: async () => ({ success: false, error: 'Web platform' }),
            addProduct: async (p) => ({ success: false, error: 'Web platform' }),
            syncProducts: async () => ({ success: false, count: 0 }),
            updateStock: async () => ({ success: false }),
            deleteProduct: async () => ({ success: false }),
            getCategories: async () => [],
            addCategory: async () => ({ success: false }),
            deleteCategory: async () => ({ success: false }),
            syncCategories: async () => ({ success: false, count: 0 }),
            getDebtors: async () => [],
            saveDebtor: async () => ({ success: false }),
            syncDebtors: async () => ({ success: false, count: 0 }),
            getPendingSales: async () => [],
            getSalesByRange: async () => [],
            markSaleSynced: async () => ({ success: false }),
            syncSales: async () => ({ success: false, count: 0 }),
            getLastSaleTimestamp: async () => null
        };
    }

    return dbInstance;
};
