import React, { useEffect, useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../config/firebase";
import { normalizeCategoryKey } from "../lib/utils/categoryNormalization";

interface Product {
  id: string;
  title: string;
  stock: number;
  price: number;
  cost: number;
  categoryId?: string;
  categoryName: string;
  quantitySold30d: number;
  avgDailyDemand: number;
  reorderPoint: number;
  suggestedPurchase: number;
  marginPercent: number | null;
  priceUpdatedAt: Date | null;
}

const InventoryTable: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [outOfStock, setOutOfStock] = useState<Product[]>([]);
  const [abcProducts, setAbcProducts] = useState<Array<Product & { abc: "A" | "B" | "C" }>>([]);
  const [stalePrices, setStalePrices] = useState<Product[]>([]);
  const [lowMargin, setLowMargin] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const ANALYSIS_DAYS = 30;
  const REORDER_WINDOW_DAYS = 7;
  const TARGET_STOCK_DAYS = 21;
  const PRICE_STALE_DAYS = 45;

  const parseDate = (value: unknown): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === "string" || typeof value === "number") {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    if (typeof value === "object" && value !== null && "seconds" in value) {
      const seconds = (value as { seconds: number }).seconds;
      return new Date(seconds * 1000);
    }
    return null;
  };

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const categoriesSnapshot = await getDocs(collection(db, "Categorias"));
        const categoryMap: Record<string, string> = {};
        categoriesSnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          categoryMap[docSnap.id] = String(data.name || "Sin categoría");
        });

        const productsSnapshot = await getDocs(collection(db, "Productos"));

        // Ventas últimos 30 días para rotación y reposición
        const today = new Date();
        const pastDate = new Date();
        pastDate.setDate(today.getDate() - ANALYSIS_DAYS);
        pastDate.setHours(0, 0, 0, 0);

        const salesQuery = query(
          collection(db, "sales"),
          where("timestamp", ">=", pastDate)
        );
        const salesSnapshot = await getDocs(salesQuery);

        // Agregación de unidades vendidas por título
        const productSales: Record<string, number> = {};
        salesSnapshot.forEach((docSnap) => {
          const saleData = docSnap.data();
          const saleProducts = (saleData.products as { title: string; quantity: number }[]) || [];
          saleProducts.forEach((p) => {
            if (p.title) {
              productSales[p.title] = (productSales[p.title] || 0) + Number(p.quantity || 0);
            }
          });
        });

        const enriched: Product[] = productsSnapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          const title = String(data.title || data.name || "Sin nombre");
          const quantitySold30d = Number(productSales[title] || 0);
          const avgDailyDemand = quantitySold30d / ANALYSIS_DAYS;
          const reorderPoint = Math.max(2, Math.ceil(avgDailyDemand * REORDER_WINDOW_DAYS));
          const stock = Number(data.stock || 0);
          const suggestedPurchase = Math.max(0, Math.ceil(avgDailyDemand * TARGET_STOCK_DAYS) - stock);
          const categoryId = String(data.category || "");
          const categoryName = categoryMap[categoryId] || categoryId || "Sin categoría";
          const price = Number(data.price || 0);
          const cost = Number(data.cost || 0);
          const marginPercent = price > 0 && cost > 0 ? ((price - cost) / price) * 100 : null;
          const priceUpdatedAt = parseDate(data.priceUpdatedAt || data.updatedAt || data.dateAdded || data.createdAt);

          return {
            id: docSnap.id,
            title,
            stock,
            price,
            cost,
            categoryId,
            categoryName,
            quantitySold30d,
            avgDailyDemand,
            reorderPoint,
            suggestedPurchase,
            marginPercent,
            priceUpdatedAt,
          };
        });

        const filtered = enriched.filter((p) => normalizeCategoryKey(p.categoryName) !== "variables");

        const critical = filtered
          .filter((p) => p.stock <= p.reorderPoint)
          .sort((a, b) => {
            if (b.quantitySold30d !== a.quantitySold30d) return b.quantitySold30d - a.quantitySold30d;
            return a.stock - b.stock;
          })
          .slice(0, 8);

        const stockout = filtered
          .filter((p) => p.stock <= 0)
          .sort((a, b) => b.quantitySold30d - a.quantitySold30d)
          .slice(0, 8);

        const totalSold = filtered.reduce((acc, item) => acc + item.quantitySold30d, 0);
        let cumulative = 0;
        const abc = [...filtered]
          .sort((a, b) => b.quantitySold30d - a.quantitySold30d)
          .slice(0, 12)
          .map((item) => {
            cumulative += item.quantitySold30d;
            const share = totalSold > 0 ? cumulative / totalSold : 1;
            const abcClass: "A" | "B" | "C" = share <= 0.8 ? "A" : share <= 0.95 ? "B" : "C";
            return { ...item, abc: abcClass };
          });

        const staleThreshold = new Date();
        staleThreshold.setDate(staleThreshold.getDate() - PRICE_STALE_DAYS);
        const stale = filtered
          .filter((p) => !p.priceUpdatedAt || p.priceUpdatedAt < staleThreshold)
          .sort((a, b) => {
            const aTime = a.priceUpdatedAt ? a.priceUpdatedAt.getTime() : 0;
            const bTime = b.priceUpdatedAt ? b.priceUpdatedAt.getTime() : 0;
            return aTime - bTime;
          })
          .slice(0, 8);

        const lowMarginList = filtered
          .filter((p) => p.marginPercent !== null && p.marginPercent < 20)
          .sort((a, b) => (a.marginPercent || 0) - (b.marginPercent || 0))
          .slice(0, 8);

        setProducts(critical);
        setOutOfStock(stockout);
        setAbcProducts(abc);
        setStalePrices(stale);
        setLowMargin(lowMarginList);
      } catch (error) {
        console.error("Error loading inventory table:", error);
      } finally {
        setLoading(false);
      }
    };

    loadProducts();
  }, []);

  if (loading) return <div className="p-4 text-center text-muted-foreground text-sm">Cargando alertas rápidas...</div>;

  return (
    <div className="bg-card p-4 rounded-2xl shadow-lg border border-border space-y-3">
      <div>
        <h3 className="text-lg font-bold text-primary mb-1">Alertas Rápidas de Inventario</h3>
        <h5 className="text-xs text-muted-foreground">Resumen para inicio</h5>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
        <div className="bg-secondary/60 border border-border rounded-lg px-3 py-2">
          <p className="text-muted-foreground">Reposición</p>
          <p className="font-bold text-foreground">{products.length}</p>
        </div>
        <div className="bg-secondary/60 border border-border rounded-lg px-3 py-2">
          <p className="text-muted-foreground">Sin stock</p>
          <p className="font-bold text-red-500">{outOfStock.length}</p>
        </div>
        <div className="bg-secondary/60 border border-border rounded-lg px-3 py-2">
          <p className="text-muted-foreground">Precios a revisar</p>
          <p className="font-bold text-amber-600">{stalePrices.length}</p>
        </div>
        <div className="bg-secondary/60 border border-border rounded-lg px-3 py-2">
          <p className="text-muted-foreground">Margen bajo</p>
          <p className="font-bold text-red-500">{lowMargin.length}</p>
        </div>
      </div>

      <section className="border border-border rounded-xl p-3">
          <h4 className="font-bold text-foreground mb-2 text-sm">Top Reposición</h4>
          {products.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin alertas críticas.</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {products.slice(0, 3).map((p) => (
                <li key={p.id} className="flex justify-between gap-3 border-b border-border/60 pb-2 last:border-b-0">
                  <p className="font-medium text-foreground truncate">{p.title}</p>
                  <div className="text-right">
                    <p className={`font-semibold ${p.stock <= 0 ? "text-red-500" : "text-amber-500"}`}>Stk {p.stock}</p>
                    <p className="text-primary font-semibold">+{Math.max(0, p.suggestedPurchase)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
      </section>

      <div className="pt-1">
        <a href="/inventario" className="text-xs font-semibold text-primary hover:underline">
          Ver análisis completo en Inventario
        </a>
      </div>
    </div>
  );
};

export default InventoryTable;
