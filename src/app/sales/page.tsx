"use client";

import { useEffect, useState } from "react";
import { getSalesByRange, getLastSales } from "../lib/sales";
import SalesClient from "./salesClient";
import { Sale } from "../types/saleTypes";

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSales = async () => {
      try {
        const data = await getLastSales(50); // Traemos las últimas 50 ventas por defecto
        setSales(data);
      } catch (error) {
        console.error("Error fetching sales:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchSales();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return <SalesClient initialSales={sales} />;
}
