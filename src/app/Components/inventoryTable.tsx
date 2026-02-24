import React, { useEffect, useState } from "react";
import { collection, query, where, getDocs, limit, orderBy } from "firebase/firestore";
import { db } from "../config/firebase";

interface Product {
  id: string;
  title: string;
  stock: number;
  category?: string;
  quantitySold?: number;
}

const InventoryTable: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProducts = async () => {
      try {
        // 1. Fetch Sales (Last 14 days) to determine "Best Sellers"
        const today = new Date();
        const pastDate = new Date();
        pastDate.setDate(today.getDate() - 14);
        pastDate.setHours(0, 0, 0, 0);

        const salesQuery = query(
          collection(db, "sales"),
          where("timestamp", ">=", pastDate)
        );
        const salesSnapshot = await getDocs(salesQuery);

        // 2. Aggregate Sales to find Top Sellers
        const productSales: Record<string, number> = {};
        salesSnapshot.forEach((doc) => {
          const saleData = doc.data();
          const products = (saleData.products as { title: string; quantity: number }[]) || [];
          products.forEach((p) => {
            if (p.title) {
              productSales[p.title] = (productSales[p.title] || 0) + (p.quantity || 0);
            }
          });
        });

        // Sort by quantity sold descending
        const topSellingTitles = Object.entries(productSales)
          .sort(([, a], [, b]) => b - a)
          .map(([title]) => title);

        // 3. Fetch Product Details for these top sellers to check stock
        // Firestore 'in' query supports up to 10 items. We'll batch or just fetch the very top ones.

        let candidates: Product[] = [];

        // Chunk logic for Firestore 'in' limit (max 10)
        const chunkSize = 10;
        const titlesToCheck = topSellingTitles.slice(0, 30); // Check top 30 sellers

        if (titlesToCheck.length > 0) {
          for (let i = 0; i < titlesToCheck.length; i += chunkSize) {
            const chunk = titlesToCheck.slice(i, i + chunkSize);
            const q = query(
              collection(db, "Productos"),
              where("title", "in", chunk)
            );
            const snapshot = await getDocs(q);
            snapshot.forEach(doc => {
              const data = doc.data();
              candidates.push({
                id: doc.id,
                title: data.title,
                stock: data.stock,
                category: data.category
              });
            });
          }
        } else {
          // Fallback if no sales: Just get low stock items
          const q = query(collection(db, "Productos"), orderBy("stock", "asc"), limit(20));
          const snapshot = await getDocs(q);
          candidates = snapshot.docs.map(doc => ({
            id: doc.id,
            title: doc.data().title,
            stock: doc.data().stock,
            category: doc.data().category
          }));
        }

        // 4. Filter for Low Stock & Exclude "Almacen"
        const filtered = candidates.filter(p => {
          const isLowStock = p.stock <= 10; // "Poco stock" custom threshold
          const isIncludedCategory =
            p.category !== "Almacen" &&
            p.category !== "Almacen2";

          return isLowStock && isIncludedCategory;
        });

        // 5. Sort by relevance (maybe by sales quantity if available, or just stock asc)
        // User asked "mas vendidos". So Priority = Sales Volume.

        const finalProducts = filtered.map(p => ({
          ...p,
          quantitySold: productSales[p.title] || 0
        })).sort((a, b) => {
          // Priority 1: Higher Sales
          // Priority 2: Lower Stock
          if (b.quantitySold !== a.quantitySold) return b.quantitySold - a.quantitySold;
          return a.stock - b.stock;
        }).slice(0, 5); // Take top 5

        setProducts(finalProducts);
      } catch (error) {
        console.error("Error loading inventory table:", error);
      } finally {
        setLoading(false);
      }
    };

    loadProducts();
  }, []);

  if (loading) return <div className="p-6 text-center text-muted-foreground">Cargando...</div>;

  return (
    <div className="bg-card p-6 rounded-2xl shadow-lg border border-border">
      <h3 className="text-2xl font-bold text-primary mb-2">Inventario Crítico</h3>
      <h5 className="text-sm text-muted-foreground mb-4">Más vendidos con poco stock ({'<'}10)</h5>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm text-left border-collapse">
          <thead>
            <tr className="bg-secondary text-secondary-foreground uppercase text-xs">
              <th className="px-4 py-3 rounded-tl-lg">Producto</th>
              <th className="px-4 py-3 rounded-tr-lg text-center">Stock</th>
            </tr>
          </thead>
          <tbody>
            {products.length > 0 ? (
              products.map((product) => (
                <tr
                  key={product.id}
                  className="hover:bg-muted/50 transition-colors border-b border-border last:border-none"
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    <div className="flex flex-col">
                      <span>{product.title}</span>
                      {product.quantitySold ? (
                        <span className="text-xs text-muted-foreground">Ventas (14d): {product.quantitySold}</span>
                      ) : null}
                    </div>
                  </td>
                  <td
                    className={`px-4 py-3 font-semibold text-center ${product.stock <= 5
                      ? "text-red-500"
                      : "text-amber-500"
                      }`}
                  >
                    {product.stock}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-muted-foreground">
                  ¡Todo en orden! No hay productos populares con bajo stock.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default InventoryTable;
