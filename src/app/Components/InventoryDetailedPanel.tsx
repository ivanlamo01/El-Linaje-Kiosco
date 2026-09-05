"use client";
import React, { useEffect, useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { FaQuestionCircle } from "react-icons/fa";
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

const InventoryDetailedPanel: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [outOfStock, setOutOfStock] = useState<Product[]>([]);
  const [abcProducts, setAbcProducts] = useState<
    Array<Product & { abc: "A" | "B" | "C" }>
  >([]);
  const [stalePrices, setStalePrices] = useState<Product[]>([]);
  const [lowMargin, setLowMargin] = useState<Product[]>([]);
  const [helpOpen, setHelpOpen] = useState({
    replenishment: false,
    stockout: false,
    abc: false,
    priceMargin: false,
  });
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

        const today = new Date();
        const pastDate = new Date();
        pastDate.setDate(today.getDate() - ANALYSIS_DAYS);
        pastDate.setHours(0, 0, 0, 0);

        const salesQuery = query(
          collection(db, "sales"),
          where("timestamp", ">=", pastDate),
        );
        const salesSnapshot = await getDocs(salesQuery);

        const productSales: Record<string, number> = {};
        salesSnapshot.forEach((docSnap) => {
          const saleData = docSnap.data();
          const saleProducts =
            (saleData.products as { title: string; quantity: number }[]) || [];
          saleProducts.forEach((p) => {
            if (p.title) {
              productSales[p.title] =
                (productSales[p.title] || 0) + Number(p.quantity || 0);
            }
          });
        });

        const seenProducts = new Set<string>();
        const enriched: Product[] = [];
        for (const docSnap of productsSnapshot.docs) {
          if (seenProducts.has(docSnap.id)) continue;
          seenProducts.add(docSnap.id);
          const data = docSnap.data();
          const title = String(data.title || data.name || "Sin nombre");
          const quantitySold30d = Number(productSales[title] || 0);
          const avgDailyDemand = quantitySold30d / ANALYSIS_DAYS;
          const reorderPoint = Math.max(
            2,
            Math.ceil(avgDailyDemand * REORDER_WINDOW_DAYS),
          );
          const stock = Number(data.stock || 0);
          const suggestedPurchase = Math.max(
            0,
            Math.ceil(avgDailyDemand * TARGET_STOCK_DAYS) - stock,
          );
          const categoryId = String(data.category || "");
          const categoryName =
            categoryMap[categoryId] || categoryId || "Sin categoría";
          const price = Number(data.price || 0);
          const cost = Number(data.cost || 0);
          const marginPercent =
            price > 0 && cost > 0 ? ((price - cost) / price) * 100 : null;
          const priceUpdatedAt = parseDate(
            data.priceUpdatedAt ||
              data.updatedAt ||
              data.dateAdded ||
              data.createdAt,
          );

          enriched.push({
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
          });
        }

        const filtered = enriched.filter(
          (p) => normalizeCategoryKey(p.categoryName) !== "variables",
        );

        const critical = filtered
          .filter((p) => p.stock <= p.reorderPoint)
          .sort((a, b) => {
            if (b.quantitySold30d !== a.quantitySold30d)
              return b.quantitySold30d - a.quantitySold30d;
            return a.stock - b.stock;
          })
          .slice(0, 8);

        const stockout = filtered
          .filter((p) => p.stock <= 0)
          .sort((a, b) => b.quantitySold30d - a.quantitySold30d)
          .slice(0, 8);

        const totalSold = filtered.reduce(
          (acc, item) => acc + item.quantitySold30d,
          0,
        );
        let cumulative = 0;
        const abc = [...filtered]
          .sort((a, b) => b.quantitySold30d - a.quantitySold30d)
          .slice(0, 12)
          .map((item) => {
            cumulative += item.quantitySold30d;
            const share = totalSold > 0 ? cumulative / totalSold : 1;
            const abcClass: "A" | "B" | "C" =
              share <= 0.8 ? "A" : share <= 0.95 ? "B" : "C";
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
        console.error("Error loading detailed inventory panel:", error);
      } finally {
        setLoading(false);
      }
    };

    loadProducts();
  }, []);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-5 text-sm text-muted-foreground">
        Cargando análisis avanzado...
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-5 mb-6 space-y-4">
      <div>
        <h2 className="text-xl font-bold text-foreground">
          Panel Operativo de Inventario
        </h2>
        <p className="text-sm text-muted-foreground">
          Reposición, quiebre, ABC, control de precios y margen
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="border border-border rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="font-bold text-foreground">Reposición Sugerida</h4>
            <button
              type="button"
              aria-label="Ayuda sobre Reposición Sugerida"
              onClick={() =>
                setHelpOpen((prev) => ({
                  ...prev,
                  replenishment: !prev.replenishment,
                }))
              }
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <FaQuestionCircle size={14} />
            </button>
          </div>
          {helpOpen.replenishment && (
            <p className="text-xs text-muted-foreground mb-2">
              Muestra productos que necesitan compra pronto segun demanda reciente y stock actual. Usa este listado para priorizar pedidos antes de quedarte sin mercaderia.
            </p>
          )}
          <ul className="space-y-2 text-sm">
            {products.length === 0 && (
              <li className="text-muted-foreground">Sin alertas críticas.</li>
            )}
            {products.map((p) => (
              <li
                key={p.id}
                className="flex justify-between border-b border-border/60 pb-2 last:border-b-0"
              >
                <span>{p.title}</span>
                <span className="font-semibold text-primary">
                  Comprar: {p.suggestedPurchase}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="border border-border rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="font-bold text-foreground">Quiebre de Stock</h4>
            <button
              type="button"
              aria-label="Ayuda sobre Quiebre de Stock"
              onClick={() =>
                setHelpOpen((prev) => ({
                  ...prev,
                  stockout: !prev.stockout,
                }))
              }
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <FaQuestionCircle size={14} />
            </button>
          </div>
          {helpOpen.stockout && (
            <p className="text-xs text-muted-foreground mb-2">
              Lista productos sin stock. Son alertas urgentes porque pueden generar ventas perdidas; conviene resolverlas primero.
            </p>
          )}
          <ul className="space-y-2 text-sm">
            {outOfStock.length === 0 && (
              <li className="text-muted-foreground">
                Sin quiebres relevantes.
              </li>
            )}
            {outOfStock.map((p) => (
              <li
                key={p.id}
                className="flex justify-between border-b border-border/60 pb-2 last:border-b-0"
              >
                <span>{p.title}</span>
                <span className="font-semibold text-red-500">Sin stock</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="border border-border rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="font-bold text-foreground">Clasificación ABC</h4>
            <button
              type="button"
              aria-label="Ayuda sobre Clasificación ABC"
              onClick={() =>
                setHelpOpen((prev) => ({
                  ...prev,
                  abc: !prev.abc,
                }))
              }
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <FaQuestionCircle size={14} />
            </button>
          </div>
          {helpOpen.abc && (
            <p className="text-xs text-muted-foreground mb-2">
              Ordena productos por impacto en ventas: A alta prioridad, B prioridad media y C prioridad menor. Te ayuda a enfocar compras y control en lo que mas mueve el negocio.
            </p>
          )}
          <ul className="space-y-2 text-sm">
            {abcProducts.length === 0 && (
              <li className="text-muted-foreground">
                Sin datos de ventas recientes.
              </li>
            )}
            {abcProducts.map((p) => (
              <li
                key={p.id}
                className="flex justify-between border-b border-border/60 pb-2 last:border-b-0"
              >
                <span>{p.title}</span>
                <span
                  className={`font-semibold ${p.abc === "A" ? "text-green-600" : p.abc === "B" ? "text-amber-600" : "text-muted-foreground"}`}
                >
                  Clase {p.abc}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="border border-border rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="font-bold text-foreground">Precio y Margen</h4>
            <button
              type="button"
              aria-label="Ayuda sobre Precio y Margen"
              onClick={() =>
                setHelpOpen((prev) => ({
                  ...prev,
                  priceMargin: !prev.priceMargin,
                }))
              }
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <FaQuestionCircle size={14} />
            </button>
          </div>
          {helpOpen.priceMargin && (
            <p className="text-xs text-muted-foreground mb-2">
              Señala productos con precios potencialmente desactualizados y margenes bajos. Sirve para revisar rentabilidad y ajustar precios a tiempo.
            </p>
          )}
          <p className="text-xs text-muted-foreground mb-1">
            Precios desactualizados: {stalePrices.length}
          </p>
          <p className="text-xs text-muted-foreground mb-2">
            Margen bajo: {lowMargin.length}
          </p>
          <ul className="space-y-2 text-sm">
            {lowMargin.length === 0 && (
              <li className="text-muted-foreground">
                Sin alertas de margen bajo.
              </li>
            )}
            {lowMargin.slice(0, 6).map((p) => (
              <li
                key={p.id}
                className="flex justify-between border-b border-border/60 pb-2 last:border-b-0"
              >
                <span>{p.title}</span>
                <span className="font-semibold text-red-500">
                  {(p.marginPercent || 0).toFixed(1)}%
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
};

export default InventoryDetailedPanel;
