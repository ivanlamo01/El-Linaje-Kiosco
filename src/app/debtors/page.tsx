"use client";
import { useEffect, useState } from "react";
import { collection, getDocs, DocumentData } from "firebase/firestore";
import { db } from "../config/firebase";
import DebtorsTable from "./DebtorsTable";

// ---------------------- TYPES ----------------------
export type Product = {
  name: string;
  title?: string;
  price: number;
  quantity: number;
};

export type DebtItem = {
  type: "debt" | "payment";
  products?: Product[];
  amount?: number;
  timestamp?: { seconds: number; nanoseconds: number } | null;
};

export type Debtor = {
  id: string;
  name: string;
  numero?: string;
  totalAmount: number;
  debts: DebtItem[];
  isClosed?: boolean;
};

// ---------------------- PAGE ----------------------
export default function DebtorsPage() {
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDebtors = async () => {
      try {
        const snapshot = await getDocs(collection(db, "debtors"));
        const list: Debtor[] = snapshot.docs.map((docSnap) => {
          const data: DocumentData = docSnap.data();

          const cleanDebts: DebtItem[] = Array.isArray(data.debts)
            ? data.debts.map((d: DocumentData): DebtItem => ({
                type: d.type === "payment" ? "payment" : "debt",
                amount: d.amount ? Number(d.amount) : 0,
                timestamp: d.timestamp
                  ? {
                      seconds: Number(d.timestamp.seconds),
                      nanoseconds: Number(d.timestamp.nanoseconds),
                    }
                  : null,
                products: Array.isArray(d.products)
                  ? d.products.map((p: DocumentData): Product => {
                      const name = p.name ? String(p.name) : (p.title ? String(p.title) : "Producto sin nombre");
                      const title = p.title ? String(p.title) : undefined;
                      return {
                        name,
                        title,
                        price: Number(p.price),
                        quantity: Number(p.quantity),
                      };
                    })
                  : [],
              }))
            : [];

          return {
            id: docSnap.id,
            name: data.name ?? "Sin nombre",
            numero: data.numero ?? "",
            totalAmount: Number(data.totalAmount) || 0,
            debts: cleanDebts,
            isClosed: data.isClosed ?? false,
          };
        });
        setDebtors(list);
      } catch (err) {
        console.error("Failed to fetch debtors", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDebtors();
  }, []);

  if (loading) {
    return (
      <div className="bg-background min-h-screen text-foreground flex items-center justify-center">
        <p>Cargando deudores...</p>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen text-foreground transition-colors duration-300">
      <DebtorsTable initialDebtors={debtors} />
    </div>
  );
}
