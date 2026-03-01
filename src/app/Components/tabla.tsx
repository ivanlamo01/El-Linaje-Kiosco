"use client";
import React, { useState, useEffect, FormEvent } from "react";

import Producto from "./Producto";
import Loading from "./Loading/Loading";
import Pagination from "./Pagination";
import { ProductoProps } from "../types/productTypes";
import { productService } from "../lib/services/productService";
import { categoryService } from "../lib/services/categoryService";

import BulkUpdateModal, { BulkActionPayload } from "./BulkUpdateModal";
import { useAuthContext } from "../Context/AuthContext";
import { useTutorial } from "../Context/TutorialContext";

const Tabla: React.FC = () => {
  const { login } = useAuthContext();
  const { startTutorial } = useTutorial();

  // --- Estados de Datos ---
  const [allProductos, setAllProductos] = useState<ProductoProps[]>([]); // Todos los productos (raw)
  const [filteredProductos, setFilteredProductos] = useState<ProductoProps[]>([]); // Productos filtrados para mostrar
  const [loading, setLoading] = useState<boolean>(true);

  // --- Estados de Filtros ---
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterStock, setFilterStock] = useState<string>("todos"); // todos, bajo, sin

  // --- Paginación ---
  const [currentPage, setCurrentPage] = useState<number>(1);
  const productsPerPage = 10;

  // --- Selección Masiva ---
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkUpdateModal, setShowBulkUpdateModal] = useState(false);

  // --- Categorías Mapping ---
  const [categoriasMap, setCategoriasMap] = useState<Record<string, string>>({});

  // --- Modales ---
  const [showProductForm, setShowProductForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductoProps | null>(null);

  // --- Formularios ---
  const [newProduct, setNewProduct] = useState({
    title: "",
    price: 0,
    category: "",
    stock: 0,
    Barcode: "",
  });

  const [newCategory, setNewCategory] = useState({
    name: "",
  });

  // 1. CARGA INICIAL DE DATOS
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Cargar Categorías
        const categories = await categoryService.getAll();
        const catMap: Record<string, string> = {};
        categories.forEach((cat) => {
          catMap[cat.id] = cat.name;
        });
        setCategoriasMap(catMap);

        // Cargar Productos usando servicio unificado
        const products = await productService.getAll();

        const productosAdaptados: ProductoProps[] = products.map((item: { id: string; title?: string; name?: string; stock?: number; price?: number; category?: string; Barcode?: string; variablePrice?: boolean }) => ({
          id: item.id,
          title: item.title || item.name || "",
          stock: item.stock ?? 0,
          price: item.price ?? 0,
          category: item.category ?? "",
          Barcode: item.Barcode ?? "",
          variablePrice: item.variablePrice,
        }));

        setAllProductos(productosAdaptados);
        setFilteredProductos(productosAdaptados); // Inicialmente mostramos todo

      } catch (e) {
        console.error("Error cargando datos:", e);
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  // 2. LÓGICA DE FILTRADO (Se ejecuta cuando cambia algun filtro o la lista base)
  useEffect(() => {
    let result = allProductos;

    // A. Filtro por Texto (Nombre O Código de Barras)
    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      result = result.filter(p =>
        p.title.toLowerCase().includes(lowerTerm) ||
        p.Barcode.includes(lowerTerm)
      );
    }

    // B. Filtro por Categoría
    if (filterCategory) {
      result = result.filter(p => p.category === filterCategory);
    }

    // C. Filtro por Estado de Stock
    if (filterStock === "bajo") {
      result = result.filter(p => p.stock > 0 && p.stock <= 5);
    } else if (filterStock === "sin") {
      result = result.filter(p => p.stock === 0);
    }

    setFilteredProductos(result);
    setCurrentPage(1); // Volver a pág 1 al filtrar
    setSelectedIds(new Set()); // Limpiar selección al filtrar
  }, [searchTerm, filterCategory, filterStock, allProductos]);

  // --- Paginación Lógica ---
  const indexOfLastProduct = currentPage * productsPerPage;
  const indexOfFirstProduct = indexOfLastProduct - productsPerPage;
  const currentProducts = filteredProductos.slice(indexOfFirstProduct, indexOfLastProduct);

  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

  // --- SELECCIÓN ---
  const handleSelectProduct = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    checked ? newSelected.add(id) : newSelected.delete(id);
    setSelectedIds(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = new Set(currentProducts.map(p => p.id));
      setSelectedIds(allIds);
    } else {
      setSelectedIds(new Set());
    }
  };

  const isAllSelected = currentProducts.length > 0 && currentProducts.every(p => selectedIds.has(p.id));

  // --- CRUD OPERATIONS WRAPPERS ---
  const refreshLocalData = (updatedProduct: ProductoProps) => {
    setAllProductos(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
  };

  const addToLocalData = (newP: ProductoProps) => {
    setAllProductos(prev => [newP, ...prev]);
  };

  const removeFromLocalData = (id: string) => {
    setAllProductos(prev => prev.filter(p => p.id !== id));
  };

  // --- ACTIONS ---
  const handleBulkUpdate = async (payload: BulkActionPayload) => {
    try {
      const { type, value, operation } = payload;

      const promises = Array.from(selectedIds).map(async (id) => {
        if (type === "price") {
          await productService.update(id, { price: Number(value) });
        } else if (type === "category") {
          await productService.update(id, { category: String(value) });
        } else if (type === "stock") {
          const p = allProductos.find(prod => prod.id === id);
          if (!p) return;
          let newStock = p.stock;
          const val = Number(value);
          if (operation === "set") newStock = val;
          if (operation === "add") newStock = p.stock + val;
          if (operation === "subtract") newStock = Math.max(0, p.stock - val);
          
          await productService.updateStock(id, newStock);
        } else if (type === "delete") {
          await productService.delete(id);
        }
      });

      await Promise.all(promises);

      // Refresh Data (simplest way to ensure consistency, though less efficient than local map)
      if (type === "delete") {
        setAllProductos(prev => prev.filter(p => !selectedIds.has(p.id)));
      } else {
        setAllProductos(prev => prev.map(p => {
          if (!selectedIds.has(p.id)) return p;
          if (type === "price") return { ...p, price: Number(value) };
          if (type === "category") return { ...p, category: String(value) };
          if (type === "stock") {
            let newStock = p.stock;
            const val = Number(value);
            if (operation === "set") newStock = val;
            else if (operation === "add") newStock = p.stock + val;
            else if (operation === "subtract") newStock = Math.max(0, p.stock - val);
            return { ...p, stock: newStock };
          }
          return p;
        }));
      }

      alert(`Operación masiva exitosa en ${selectedIds.size} productos ✅`);
      setSelectedIds(new Set());
    } catch (error) {
      console.error(error);
      alert("Error en operación masiva ❌");
    }
  };

  const handleAddProduct = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...newProduct,
        price: Number(newProduct.price),
        stock: Number(newProduct.stock),
        // We use title for UI but backend might use 'name' or 'title'. 
        // ProductService expects 'name' or 'title'.
        name: newProduct.title, 
        title: newProduct.title,
      };

      const result = await productService.add(payload);
      
      if (result.success && result.id) {
          addToLocalData({ ...payload, id: result.id, Barcode: payload.Barcode } as ProductoProps);
          alert("Producto agregado ✅");
          setShowProductForm(false);
          setNewProduct({ title: "", price: 0, category: "", stock: 0, Barcode: "" });
      } else {
        alert("Error al agregar producto: " + result.error);
      }
    } catch (error) {
       console.error(error);
       alert("Error al agregar producto ❌");
    }
  };

  const handleUpdateProduct = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingProduct?.id) return;
    try {
      const payload = {
        title: editingProduct.title,
        price: Number(editingProduct.price),
        category: editingProduct.category,
        stock: Number(editingProduct.stock),
        Barcode: editingProduct.Barcode,
      };
      
      await productService.update(editingProduct.id, payload);

      refreshLocalData({ ...editingProduct, ...payload });
      alert("Producto actualizado ✅");
      setEditingProduct(null);
    } catch (error) {
      console.error(error);
      alert("Error al actualizar ❌");
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar este producto?")) return;
    try {
      await productService.delete(id);
      removeFromLocalData(id);
    } catch (error) {
      console.error(error);
      alert("Error al eliminar ❌");
    }
  };

  const handleAddCategory = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const result = await categoryService.add(newCategory);
      if (result.success && result.id) {
          setCategoriasMap(prev => ({ ...prev, [result.id!]: newCategory.name }));
          alert("Categoría creada ✅");
          setShowCategoryForm(false);
          setNewCategory({ name: "" });
      } else {
        alert("Error creando categoría: " + result.error);
      }
    } catch (error) {
      alert("Error creando categoría");
    }
  };

  const handleDeleteCategory = async () => {
    if (!filterCategory) return;
    if (!confirm(`¿Estás seguro de eliminar la categoría "${categoriasMap[filterCategory]}"? Esta acción no se puede deshacer.`)) return;

    try {
      await categoryService.delete(filterCategory);

      // Update local state
      const newMap = { ...categoriasMap };
      delete newMap[filterCategory];
      setCategoriasMap(newMap);

      // Reset filter
      setFilterCategory("");

      alert("Categoría eliminada ✅");
    } catch (error) {
      console.error("Error eliminando categoría:", error);
      alert("Error al eliminar categoría ❌");
    }
  };

  return (
    <div className="w-full">
      <Loading loading={loading} />

      {/* --- PANEL DE CONTROL Y FILTROS --- */}
      <div className="bg-card border border-border p-5 rounded-2xl mb-6 shadow-sm flex flex-col gap-4">

        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-foreground">
              Total Productos: <span className="text-primary">{filteredProductos.length}</span>
            </h2>
            <button
              onClick={() => startTutorial('specific')}
              className="flex items-center gap-2 bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/40 px-3 py-1.5 rounded-lg transition-colors font-medium text-sm shadow-sm"
              title="Ver ayuda de inventario"
            >
              <span>❓</span>
              <span>Tutorial</span>
            </button>
          </div>

          {/* Botones Acciones Generales */}
          <div className="flex gap-2 w-full md:w-auto">
            {login && (
              <>
                <button id="btn-add-product" onClick={() => setShowProductForm(true)} className="bg-primary text-primary-foreground hover:opacity-90 px-4 py-2 rounded-lg font-bold shadow-md transition-all text-sm flex-1 md:flex-none whitespace-nowrap">
                  + Producto
                </button>
                <button id="btn-add-category" onClick={() => setShowCategoryForm(true)} className="bg-secondary text-foreground hover:bg-secondary/80 border border-border px-4 py-2 rounded-lg font-bold shadow-sm transition-all text-sm flex-1 md:flex-none whitespace-nowrap">
                  + Categoría
                </button>
              </>
            )}
          </div>
        </div>


        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">

          <div id="search-input" className="md:col-span-6 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">🔍</span>
            <input
              type="text"
              placeholder="Buscar por nombre o código de barras..."
              className="w-full pl-10 pr-4 py-3 bg-input border border-border rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all placeholder:text-muted-foreground/60 text-foreground"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* 2. Filtro Categoría */}
          <div className="md:col-span-3 flex gap-2">
            <select
              id="filter-category"
              className="w-full h-full px-4 py-3 bg-input border border-border rounded-xl focus:ring-2 focus:ring-primary outline-none cursor-pointer text-foreground appearance-none"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="">📂 Todas las Categorías</option>
              {Object.entries(categoriasMap).map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
            {login && filterCategory && (
              <button
                onClick={handleDeleteCategory}
                className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 px-4 py-3 rounded-xl transition-colors"
                title="Eliminar categoría seleccionada"
              >
                🗑️
              </button>
            )}
          </div>

          <div className="md:col-span-3">
            <select
              id="filter-stock"
              className={`w-full h-full px-4 py-3 border border-border rounded-xl focus:ring-2 focus:ring-primary outline-none cursor-pointer appearance-none font-medium
                        ${filterStock === 'bajo' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                  filterStock === 'sin' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-input text-foreground'}
                    `}
              value={filterStock}
              onChange={(e) => setFilterStock(e.target.value)}
            >
              <option value="todos">📦 Stock: Todos</option>
              <option value="bajo">⚠️ Stock Bajo (1-5)</option>
              <option value="sin">❌ Sin Stock (0)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div id="inventory-table" className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                {login && (
                  <th className="p-4 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
                    />
                  </th>
                )}
                <th className="p-4 font-semibold">Barcode</th>
                <th className="p-4 font-semibold">Producto</th>
                <th className="p-4 font-semibold">Precio</th>
                <th className="p-4 font-semibold">Categoría</th>
                <th className="p-4 font-semibold text-center">Stock</th>
                <th className="p-4 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-foreground text-sm">
              {currentProducts.map((product) => (
                <Producto
                  key={product.id}
                  {...product}
                  categoryName={categoriasMap[product.category] || "Sin Categoría"}
                  isSelected={selectedIds.has(product.id)}
                  onSelect={(checked) => handleSelectProduct(product.id, checked)}
                  onEdit={() => setEditingProduct(product)}
                  onDelete={() => handleDeleteProduct(product.id)}
                />
              ))}
              {currentProducts.length === 0 && (
                <tr>
                  <td colSpan={login ? 7 : 6} className="p-12 text-center text-muted-foreground flex flex-col items-center justify-center w-full">
                    <p className="text-4xl mb-2">🕵️‍♂️</p>
                    <p>No se encontraron productos con esos filtros.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8 flex justify-center mb-24">
        <Pagination productsPerPage={productsPerPage} totalProducts={filteredProductos.length} currentPage={currentPage} paginate={paginate} />
      </div>

      {/* --- FLOATING TOOLBAR --- */}
      {selectedIds.size > 0 && login && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-foreground text-background px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-6 z-40 animate-slide-up border border-border/20">
          <span className="font-bold whitespace-nowrap">{selectedIds.size} seleccionados</span>
          <div className="h-6 w-px/20"></div>
          <button
            onClick={() => setShowBulkUpdateModal(true)}
            className="bg-primary text-primary-foreground hover:opacity-90 px-4 py-2 rounded-lg font-bold shadow-sm transition-all text-sm whitespace-nowrap flex items-center gap-2"
          >
            ⚙️ Gestionar
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm opacity-70 hover:opacity-100 hover:text-red-400 transition-colors"
          >
            ✕ Cancelar
          </button>
        </div>
      )}

      {/* --- MODALES --- */}

      {/* Bulk Update */}
      {showBulkUpdateModal && (
        <BulkUpdateModal
          count={selectedIds.size}
          categories={categoriasMap}
          onClose={() => setShowBulkUpdateModal(false)}
          onConfirm={handleBulkUpdate}
        />
      )}

      {/* Agregar Producto */}
      {showProductForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <form onSubmit={handleAddProduct} className="bg-card border border-border p-6 rounded-2xl shadow-xl w-full max-w-lg space-y-4">
            <h2 className="text-xl font-bold">Nuevo Producto</h2>
            <input type="text" placeholder="Título" className="w-full p-3 border border-border rounded-xl bg-input text-foreground" value={newProduct.title} onChange={(e) => setNewProduct({ ...newProduct, title: e.target.value })} required />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-bold mb-1 block">Precio</span>
                <input type="number" placeholder="Precio" className="w-full p-3 border border-border rounded-xl bg-input text-foreground" value={newProduct.price} onChange={(e) => setNewProduct({ ...newProduct, price: Number(e.target.value) })} required />
              </label>
              <label className="block">
                <span className="text-sm font-bold mb-1 block">Stock</span>
                <input type="number" placeholder="Stock" className="w-full p-3 border border-border rounded-xl bg-input text-foreground" value={newProduct.stock} onChange={(e) => setNewProduct({ ...newProduct, stock: Number(e.target.value) })} required />
              </label>
            </div>
            <select className="w-full p-3 border border-border rounded-xl bg-input text-foreground" value={newProduct.category} onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })} required >
              <option value="">Seleccionar categoría</option>
              {Object.entries(categoriasMap).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <label>
              Codigo de Barras
              <input type="text" placeholder="Código de Barras" className="w-full p-3 border border-border rounded-xl bg-input text-foreground" value={newProduct.Barcode} onChange={(e) => setNewProduct({ ...newProduct, Barcode: e.target.value })} />
            </label>
            <div className="flex gap-2 justify-end mt-4">
              <button type="button" onClick={() => setShowProductForm(false)} className="px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button type="submit" className="px-4 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-lg">Guardar</button>
            </div>
          </form>
        </div>
      )}

      {/* Agregar Categoría */}
      {showCategoryForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <form onSubmit={handleAddCategory} className="bg-card border border-border p-6 rounded-2xl shadow-xl w-full max-w-sm space-y-4">
            <h2 className="text-xl font-bold">Nueva Categoría</h2>
            <label>
              Nombre
              <input type="text" placeholder="Nombre" className="w-full p-3 border border-border rounded-xl bg-input text-foreground" value={newCategory.name} onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })} required />
            </label>
            <div className="flex gap-2 justify-end mt-4">
              <button type="button" onClick={() => setShowCategoryForm(false)} className="px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button type="submit" className="px-4 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-lg">Guardar</button>
            </div>
          </form>
        </div>
      )}

      {/* Editar Producto */}
      {editingProduct && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <form onSubmit={handleUpdateProduct} className="bg-card border border-border p-6 rounded-2xl shadow-xl w-full max-w-lg space-y-4">
            <h2 className="text-xl font-bold">Editar Producto</h2>
            <label>
              Título
              <input type="text" placeholder="Título" className="w-full p-3 border border-border rounded-xl bg-input text-foreground" value={editingProduct.title} onChange={(e) => setEditingProduct({ ...editingProduct, title: e.target.value })} required />
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-bold mb-1 block">Precio</span>
                <input type="number" placeholder="Precio" className="w-full p-3 border border-border rounded-xl bg-input text-foreground" value={editingProduct.price} onChange={(e) => setEditingProduct({ ...editingProduct, price: Number(e.target.value) })} required />
              </label>
              <label className="block">
                <span className="text-sm font-bold mb-1 block">Stock</span>
                <input type="number" placeholder="Stock" className="w-full p-3 border border-border rounded-xl bg-input text-foreground" value={editingProduct.stock} onChange={(e) => setEditingProduct({ ...editingProduct, stock: Number(e.target.value) })} required />
              </label>
            </div>
            <label>
              Categoría
              <select className="w-full p-3 border border-border rounded-xl bg-input text-foreground" value={editingProduct.category} onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })} required >
                <option value="">Seleccionar categoría</option>
                {Object.entries(categoriasMap).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
            <label>
              Codigo de Barras
              <input type="text" placeholder="Código de Barras" className="w-full p-3 border border-border rounded-xl bg-input text-foreground" value={editingProduct.Barcode} onChange={(e) => setEditingProduct({ ...editingProduct, Barcode: e.target.value })} />
            </label>
            <div className="flex gap-2 justify-end mt-4">
              <button type="button" onClick={() => setEditingProduct(null)} className="px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button type="submit" className="px-4 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-lg">Actualizar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default Tabla;