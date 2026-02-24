// types/saleTypes.ts
import { Timestamp } from "firebase/firestore";

export interface FirestoreProduct {
    title?: string;
    description?: string;
    price?: number | string;
    quantity?: number | string;
}

export interface FirestoreSale {
    total?: number | string;
    timestamp: Timestamp;
    paymentMethod?: string;
    products?: FirestoreProduct[];
    facturaId?: string; // ID of the generated AFIP invoice
}

// Tipos ya normalizados (los que usás en el frontend)
export interface Product {
    title: string;
    description?: string;
    price: number;
    quantity: number;
}

export interface Sale {
    id: string;
    total: number;
    date: Timestamp;
    paymentMethod: string;
    products: Product[];
    facturaId?: string; // Optional field to link with AFIP invoice
}
