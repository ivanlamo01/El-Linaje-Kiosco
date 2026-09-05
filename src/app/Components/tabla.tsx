"use client";
import React, { useState, useEffect, useRef, FormEvent } from "react";
import { FaCogs, FaQuestionCircle, FaSearch, FaTimes, FaTrash } from "react-icons/fa";
import Producto from "./Producto";
import Loading from "./Loading/Loading";
import Pagination from "./Pagination";
import { ProductoProps } from "../types/productTypes";
import { productService } from "../lib/services/productService";
import { categoryService } from "../lib/services/categoryService";
import BulkUpdateModal, { BulkActionPayload } from "./BulkUpdateModal";
import CustomAlert, { AlertType } from "./CustomAlert";
import { useAuthContext } from "../Context/AuthContext";
import { useTutorial } from "../Context/TutorialContext";
import { formatCategoryName, normalizeCategoryKey } from "../lib/utils/categoryNormalization";
import { addDoc, collection, serverTimestamp, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import { isOnline } from "../lib/utils/environment";

const Tabla: React.FC = () => {
  const { login, user } = useAuthContext();
  const { startTutorial } = useTutorial();

  // --- Estados de Datos ---
  const [allProductos, setAllProductos] = useState<ProductoProps[]>([]); // Todos los productos (raw)
  const [filteredProductos, setFilteredProductos] = useState<ProductoProps[]>([]); // Productos filtrados para mostrar
  const [loading, setLoading] = useState<boolean>(true);

  // --- Estados de Filtros ---
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterStock, setFilterStock] = useState<string>("todos"); // todos, bajo, sin
  const [sortBy, setSortBy] = useState<string>("name-asc");

  // --- Paginación ---
  const [currentPage, setCurrentPage] = useState<number>(1);
  const productsPerPage = 10;

  // --- Selección Masiva ---
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkUpdateModal, setShowBulkUpdateModal] = useState(false);

  // --- Categorías Mapping ---
  const [categoriasMap, setCategoriasMap] = useState<Record<string, string>>({});

  // --- Category Dropdown ---
  const [categorySearch, setCategorySearch] = useState<string>("");
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  // --- Modales ---
  const [showProductForm, setShowProductForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [isSubmittingProduct, setIsSubmittingProduct] = useState(false);
  const [isUpdatingProduct, setIsUpdatingProduct] = useState(false);
  const [isSubmittingCategory, setIsSubmittingCategory] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductoProps | null>(null);
  const [alertConfig, setAlertConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: AlertType;
    showCancel?: boolean;
    confirmText?: string;
    onConfirm: () => void;
    onCancel?: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    type: "info",
    onConfirm: () => { },
  });

  // --- Formularios ---
  const [newProduct, setNewProduct] = useState({
    title: "",
    price: "" as number | "",
    cost: "" as number | "",
    category: "",
    stock: "" as number | "",
    Barcode: "",
  });

  const [newCategory, setNewCategory] = useState({
    name: "",
  });

  const normalizeSortValue = (value: string | undefined) => {
    return (value || "").trim().toLocaleLowerCase("es");
  };

  // Close category dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setIsCategoryDropdownOpen(false);
        setCategorySearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!login) return;
      if (!(event.ctrlKey && event.shiftKey)) return;

      const key = event.key.toLowerCase();
      if (key === "n") {
        event.preventDefault();
        setShowProductForm(true);
      }
      if (key === "c") {
        event.preventDefault();
        setShowCategoryForm(true);
      }
      if (key === "g" && selectedIds.size > 0) {
        event.preventDefault();
        setShowBulkUpdateModal(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [login, selectedIds.size]);

  const logAuditEvent = async (action: string, detail: string) => {
    try {
      await addDoc(collection(db, "AuditLogs"), {
        action,
        detail,
        actorId: user?.id || "desconocido",
        actorEmail: user?.email || "desconocido",
        timestamp: serverTimestamp(),
      });
    } catch (error) {
      console.warn("No se pudo registrar auditoría", error);
    }
  };

  const closeAlert = () => setAlertConfig((prev) => ({ ...prev, isOpen: false }));

  const showMessage = (title: string, message: string, type: AlertType = "info") => {
    setAlertConfig({
      isOpen: true,
      title,
      message,
      type,
      showCancel: false,
      confirmText: "Entendido",
      onConfirm: closeAlert,
    });
  };

  const showConfirm = (title: string, message: string, onConfirmAction: () => Promise<void> | void) => {
    setAlertConfig({
      isOpen: true,
      title,
      message,
      type: "warning",
      showCancel: true,
      confirmText: "Confirmar",
      isLoading: false,
      onConfirm: async () => {
        setAlertConfig(prev => ({ ...prev, isLoading: true }));
        try {
          await onConfirmAction();
        } catch (err) {
          console.error(err);
          closeAlert();
        }
      },
      onCancel: closeAlert,
    });
  };

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

        const productosAdaptados: ProductoProps[] = products.map((item: { id: string; title?: string; name?: string; stock?: number; price?: number; cost?: number; category?: string; Barcode?: string; variablePrice?: boolean; priceUpdatedAt?: unknown }) => ({
          id: item.id,
          title: item.title || item.name || "",
          stock: item.stock ?? 0,
          price: item.price ?? 0,
          cost: item.cost ?? 0,
          category: item.category ?? "",
          Barcode: item.Barcode ?? "",
          variablePrice: item.variablePrice,
          priceUpdatedAt: item.priceUpdatedAt as ProductoProps["priceUpdatedAt"],
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

  // 1b. SUSCRIPCIÓN EN TIEMPO REAL (solo online): refleja al instante cualquier
  // cambio en los productos (ventas, ediciones, altas/bajas), incluso si se hizo
  // desde otra caja/dispositivo. Offline usamos el cache local de la carga inicial.
  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      if (!(await isOnline())) return;
      if (cancelled) return;

      unsub = onSnapshot(
        collection(db, "Productos"),
        (snapshot) => {
          const seen = new Set<string>();
          const productosAdaptados: ProductoProps[] = [];
          for (const d of snapshot.docs) {
            if (seen.has(d.id)) continue;
            seen.add(d.id);
            const data = d.data() as Record<string, unknown>;
            productosAdaptados.push({
              id: d.id,
              title: (data.title as string) || (data.name as string) || "",
              stock: (data.stock as number) ?? 0,
              price: (data.price as number) ?? 0,
              cost: (data.cost as number) ?? 0,
              category: (data.category as string) ?? "",
              Barcode: (data.Barcode as string) ?? "",
              variablePrice: data.variablePrice as boolean | undefined,
              priceUpdatedAt: data.priceUpdatedAt as ProductoProps["priceUpdatedAt"],
            });
          }
          setAllProductos(productosAdaptados);
          setLoading(false);
        },
        (error) => {
          console.error("[Tabla] Error en la suscripción en vivo de productos:", error);
        }
      );
    })();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, []);

  // 2. LÓGICA DE FILTRADO (Se ejecuta cuando cambia algun filtro o la lista base)
  useEffect(() => {
    const seen = new Set<string>();
    const unique = allProductos.filter((p) => {
      if (!p.id || seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    let result = unique;

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

    const sortedResult = [...result].sort((a, b) => {
      const titleA = normalizeSortValue(a.title);
      const titleB = normalizeSortValue(b.title);
      const categoryA = normalizeSortValue(categoriasMap[a.category] || "Sin categoría");
      const categoryB = normalizeSortValue(categoriasMap[b.category] || "Sin categoría");

      switch (sortBy) {
        case "name-desc":
          return titleB.localeCompare(titleA, "es");
        case "price-asc":
          return a.price - b.price;
        case "price-desc":
          return b.price - a.price;
        case "stock-asc":
          return a.stock - b.stock;
        case "stock-desc":
          return b.stock - a.stock;
        case "category-asc":
          return categoryA.localeCompare(categoryB, "es");
        case "category-desc":
          return categoryB.localeCompare(categoryA, "es");
        case "name-asc":
        default:
          return titleA.localeCompare(titleB, "es");
      }
    });

    setFilteredProductos(sortedResult);
    setCurrentPage(1); // Volver a pág 1 al filtrar
    setSelectedIds(new Set()); // Limpiar selección al filtrar
  }, [searchTerm, filterCategory, filterStock, sortBy, allProductos, categoriasMap]);

  // --- Paginación Lógica ---
  const indexOfLastProduct = currentPage * productsPerPage;
  const indexOfFirstProduct = indexOfLastProduct - productsPerPage;
  const currentProducts = filteredProductos.slice(indexOfFirstProduct, indexOfLastProduct);

  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

  // --- SELECCIÓN ---
  const handleSelectProduct = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
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
    setAllProductos(prev => {
      if (prev.some(p => p.id === newP.id)) {
        return prev.map(p => p.id === newP.id ? newP : p);
      }
      return [newP, ...prev];
    });
  };

  const removeFromLocalData = (id: string) => {
    setAllProductos(prev => prev.filter(p => p.id !== id));
  };

  // --- ACTIONS ---
  const handleBulkUpdate = async (payload: BulkActionPayload) => {
    try {
      const { type, value, operation } = payload;
      const touchedProducts = allProductos.filter((prod) => selectedIds.has(prod.id));

      const promises = Array.from(selectedIds).map(async (id) => {
        if (type === "price") {
          const res = await productService.update(id, { price: Number(value), priceUpdatedAt: new Date() });
          if (!res.success) throw new Error(res.error || "Error al actualizar precio");
        } else if (type === "category") {
          const res = await productService.update(id, { category: String(value) });
          if (!res.success) throw new Error(res.error || "Error al actualizar categoría");
        } else if (type === "stock") {
          const p = allProductos.find(prod => prod.id === id);
          if (!p) return;
          let newStock = p.stock;
          const val = Number(value);
          if (operation === "set") newStock = val;
          if (operation === "add") newStock = p.stock + val;
          if (operation === "subtract") newStock = p.stock - val;
          if (newStock < 0) {
            throw new Error(`El stock de ${p.title} no puede quedar negativo.`);
          }
          
          const res = await productService.updateStock(id, newStock);
          if (!res.success) throw new Error(res.error || "Error al actualizar stock");
        } else if (type === "delete") {
          const res = await productService.delete(id);
          if (!res.success) throw new Error(res.error || "Error al eliminar");
        }
      });

      await Promise.all(promises);

      // Refresh Data (simplest way to ensure consistency, though less efficient than local map)
      if (type === "delete") {
        setAllProductos(prev => prev.filter(p => !selectedIds.has(p.id)));
      } else {
        setAllProductos(prev => prev.map(p => {
          if (!selectedIds.has(p.id)) return p;
          if (type === "price") return { ...p, price: Number(value), priceUpdatedAt: new Date().toISOString() };
          if (type === "category") return { ...p, category: String(value) };
          if (type === "stock") {
            let newStock = p.stock;
            const val = Number(value);
            if (operation === "set") newStock = val;
            else if (operation === "add") newStock = p.stock + val;
            else if (operation === "subtract") newStock = p.stock - val;
            return { ...p, stock: newStock };
          }
          return p;
        }));
      }

      await logAuditEvent(
        "bulk_update",
        `Acción ${type} sobre ${selectedIds.size} productos: ${touchedProducts.map((p) => p.title).slice(0, 8).join(", ")}`
      );

      showMessage("Operación completada", `Operación masiva exitosa en ${selectedIds.size} productos`, "success");
      setSelectedIds(new Set());
    } catch (error) {
      console.error(error);
      await logAuditEvent("error", `Error en operación masiva: ${error instanceof Error ? error.message : error}`);
      showMessage("Error", "Error en operación masiva", "error");
    }
  };

  const handleAddProduct = async (e: FormEvent) => {
    e.preventDefault();

    if (!newProduct.title.trim()) {
      showMessage("Error", "El título es obligatorio.", "error");
      return;
    }
    if (!newProduct.category) {
      showMessage("Error", "Debes seleccionar una categoría.", "error");
      return;
    }
    if (Number(newProduct.stock) < 0 || Number(newProduct.price) < 0 || Number(newProduct.cost || 0) < 0) {
      showMessage("Error", "Precio, costo y stock no pueden ser negativos.", "error");
      return;
    }
    if (Number(newProduct.cost || 0) > Number(newProduct.price || 0) && Number(newProduct.price || 0) > 0) {
      showMessage("Aviso de margen", "El costo es mayor al precio de venta. Revisá el valor antes de guardar.", "warning");
    }
    
    // Check for duplicate barcode
    const duplicateBarcode = newProduct.Barcode && newProduct.Barcode.trim() !== "" 
      ? allProductos.find(p => p.Barcode === newProduct.Barcode)
      : undefined;

    // Check for duplicate title
    const duplicateTitle = allProductos.find(p => p.title.toLowerCase() === newProduct.title.toLowerCase());

    const checkDuplicateTitleAndAdd = () => {
      if (duplicateTitle) {
        showConfirm(
          "Producto duplicado",
          `Ya existe un producto llamado "${newProduct.title}". ¿Estás seguro de que quieres agregarlo de nuevo?`,
          () => { void executeAddProduct(); }
        );
      } else {
        void executeAddProduct();
      }
    };

    if (duplicateBarcode) {
      showConfirm(
        "Código de barras duplicado",
        `El código de barras "${newProduct.Barcode}" ya existe en el producto "${duplicateBarcode.title}". ¿Estás seguro de que quieres asignarlo igual?`,
        () => checkDuplicateTitleAndAdd()
      );
      return;
    }
    
    checkDuplicateTitleAndAdd();
  };

  const executeAddProduct = async () => {
    if (isSubmittingProduct) return;
    setIsSubmittingProduct(true);
    try {
      const trimmedTitle = newProduct.title.trim();
      const payload = {
        ...newProduct,
        title: trimmedTitle,
        price: Number(newProduct.price),
        cost: Number(newProduct.cost || 0),
        stock: Number(newProduct.stock),
        name: trimmedTitle,
        priceUpdatedAt: new Date(),
        costUpdatedAt: new Date(),
      };

      const result = await productService.add(payload);
      
      if (result.success && result.id) {
          addToLocalData({ ...payload, id: result.id, Barcode: payload.Barcode } as ProductoProps);
          await logAuditEvent("create_product", `Producto creado: ${payload.title}`);
          showMessage("Producto agregado", "El producto se agregó correctamente.", "success");
          setShowProductForm(false);
          setNewProduct({ title: "", price: "", cost: "", category: "", stock: "", Barcode: "" });
      } else {
        showMessage("Error", "Error al agregar producto: " + result.error, "error");
      }
    } catch (error) {
       console.error(error);
       await logAuditEvent("error", `Error al agregar producto: ${error instanceof Error ? error.message : error}`);
      showMessage("Error", "Error al agregar producto", "error");
    } finally {
      setIsSubmittingProduct(false);
    }
  };

  const handleUpdateProduct = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingProduct?.id) return;
    if (Number(editingProduct.price) < 0 || Number(editingProduct.cost || 0) < 0 || Number(editingProduct.stock) < 0) {
      showMessage("Error", "Precio, costo y stock no pueden ser negativos.", "error");
      return;
    }
    if (isUpdatingProduct) return;
    setIsUpdatingProduct(true);
    try {
      const priceChanged =
        Number(editingProduct.price) !== Number(allProductos.find((p) => p.id === editingProduct.id)?.price);

      const payload: {
        title: string;
        price: number;
        cost: number;
        category: string;
        stock: number;
        Barcode: string;
        priceUpdatedAt?: Date | ProductoProps["priceUpdatedAt"];
      } = {
        title: editingProduct.title || "",
        price: Number(editingProduct.price),
        cost: Number(editingProduct.cost || 0),
        category: editingProduct.category || "",
        stock: Number(editingProduct.stock),
        Barcode: editingProduct.Barcode || "",
      };

      if (priceChanged) {
        payload.priceUpdatedAt = new Date();
      } else if (editingProduct.priceUpdatedAt) {
        payload.priceUpdatedAt = editingProduct.priceUpdatedAt;
      }

      const res = await productService.update(editingProduct.id, payload);
      if (!res.success) throw new Error(res.error || "Error al actualizar en base de datos");

      refreshLocalData({ ...editingProduct, ...payload });
      await logAuditEvent("update_product", `Producto actualizado: ${payload.title}`);
      showMessage("Producto actualizado", "Los cambios se guardaron correctamente.", "success");
      setEditingProduct(null);
    } catch (error) {
      console.error(error);
      await logAuditEvent("error", `Error al actualizar producto: ${error instanceof Error ? error.message : error}`);
      showMessage("Error", "Error al actualizar", "error");
    } finally {
      setIsUpdatingProduct(false);
    }
  };

  const executeDeleteProduct = async (id: string) => {
    try {
      const productName = allProductos.find((p) => p.id === id)?.title || id;
      await productService.delete(id);
      removeFromLocalData(id);
      await logAuditEvent("delete_product", `Producto eliminado: ${productName}`);
      showMessage("Producto eliminado", "El producto se eliminó correctamente.", "success");
    } catch (error) {
      console.error(error);
      await logAuditEvent("error", `Error al eliminar producto: ${error instanceof Error ? error.message : error}`);
      showMessage("Error", "Error al eliminar producto", "error");
    }
  };

  const handleDeleteProduct = (id: string) => {
    showConfirm("Eliminar producto", "¿Estás seguro de eliminar este producto?", () => {
      void executeDeleteProduct(id);
    });
  };

  const handleAddCategory = async (e: FormEvent) => {
    e.preventDefault();
    const normalizedNewCategoryKey = normalizeCategoryKey(newCategory.name);
    const formattedName = formatCategoryName(newCategory.name);

    if (!formattedName) {
      showMessage("Error", "El nombre de categoría es obligatorio.", "error");
      return;
    }
    
    // Verification: Check if category already exists
    const exists = Object.values(categoriasMap).some(
      name => normalizeCategoryKey(name) === normalizedNewCategoryKey
    );

    if (exists) {
      showMessage(
        "Categoría existente", 
        `La categoría "${formattedName}" ya existe. Por favor, usa un nombre diferente.`, 
        "warning"
      );
      return;
    }

    if (isSubmittingCategory) return;
    setIsSubmittingCategory(true);
    try {
      const result = await categoryService.add({ name: formattedName });
      if (result.success && result.id) {
          setCategoriasMap(prev => ({ ...prev, [result.id!]: formattedName }));
          showMessage("Categoría creada", "La categoría se creó correctamente.", "success");
          setShowCategoryForm(false);
          setNewCategory({ name: "" });
      } else {
        showMessage("Error", "Error creando categoría: " + result.error, "error");
      }
    } catch {
      showMessage("Error", "Error creando categoría", "error");
    } finally {
      setIsSubmittingCategory(false);
    }
  };

  const executeDeleteCategory = async () => {
    if (!filterCategory) return;

    try {
      await categoryService.delete(filterCategory);

      // Update local state
      const newMap = { ...categoriasMap };
      delete newMap[filterCategory];
      setCategoriasMap(newMap);

      // Reset filter
      setFilterCategory("");

      showMessage("Categoría eliminada", "La categoría se eliminó correctamente.", "success");
    } catch (error) {
      console.error("Error eliminando categoría:", error);
      showMessage("Error", "Error al eliminar categoría", "error");
    }
  };

  const handleDeleteCategory = () => {
    if (!filterCategory) return;
    showConfirm(
      "Eliminar categoría",
      `¿Estás seguro de eliminar la categoría "${categoriasMap[filterCategory]}"? Esta acción no se puede deshacer.`,
      () => {
        void executeDeleteCategory();
      }
    );
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
              <FaQuestionCircle />
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

          <div id="search-input" className="md:col-span-4 relative">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
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
            <div className="relative w-full" ref={categoryDropdownRef}>
              {/* Trigger button */}
              <button
                id="filter-category"
                type="button"
                onClick={() => {
                  setIsCategoryDropdownOpen(prev => !prev);
                  setCategorySearch("");
                }}
                className={`w-full h-full ${filterCategory ? 'pr-10' : 'pr-4'} pl-4 py-3 bg-input border border-border rounded-xl focus:ring-2 focus:ring-primary outline-none cursor-pointer text-foreground text-left transition-all truncate`}
              >
                {filterCategory ? categoriasMap[filterCategory] : "Todas las Categorías"}
              </button>
              {filterCategory && (
                <button
                  onClick={() => setFilterCategory("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors p-1"
                  title="Quitar filtro de categoría"
                >
                  <FaTimes />
                </button>
              )}
              {/* Dropdown panel */}
              {isCategoryDropdownOpen && (
                <div className="absolute z-50 top-full mt-1 w-full bg-card border border-border rounded-xl shadow-lg overflow-hidden">
                  <div className="p-2">
                    <div className="relative">
                      <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs" />
                      <input
                        autoFocus
                        type="text"
                        placeholder="Buscar categoría..."
                        className="w-full pl-8 pr-3 py-2 bg-input border border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/60 text-foreground"
                        value={categorySearch}
                        onChange={(e) => setCategorySearch(e.target.value)}
                      />
                    </div>
                  </div>
                  <ul className="max-h-52 overflow-y-auto">
                    <li>
                      <button
                        type="button"
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-muted transition-colors ${
                          filterCategory === "" ? "bg-primary/10 text-primary font-medium" : "text-foreground"
                        }`}
                        onClick={() => {
                          setFilterCategory("");
                          setIsCategoryDropdownOpen(false);
                          setCategorySearch("");
                        }}
                      >
                        Todas las Categorías
                      </button>
                    </li>
                    {Object.entries(categoriasMap)
                      .sort(([, a], [, b]) => a.localeCompare(b, 'es'))
                      .filter(([, name]) => name.toLowerCase().includes(categorySearch.toLowerCase()))
                      .map(([id, name]) => (
                        <li key={id}>
                          <button
                            type="button"
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-muted transition-colors ${
                              filterCategory === id ? "bg-primary/10 text-primary font-medium" : "text-foreground"
                            }`}
                            onClick={() => {
                              setFilterCategory(id);
                              setIsCategoryDropdownOpen(false);
                              setCategorySearch("");
                            }}
                          >
                            {name}
                          </button>
                        </li>
                      ))}
                    {Object.entries(categoriasMap).filter(([, name]) =>
                      name.toLowerCase().includes(categorySearch.toLowerCase())
                    ).length === 0 && (
                      <li className="px-4 py-3 text-sm text-muted-foreground text-center">Sin resultados</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
            {login && filterCategory && (
              <button
                onClick={handleDeleteCategory}
                className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 px-4 py-3 rounded-xl transition-colors shrink-0"
                title="Eliminar categoría de la base de datos"
              >
                <FaTrash />
              </button>
            )}
          </div>

          <div className="md:col-span-2">
            <select
              id="filter-stock"
              className={`w-full h-full px-4 py-3 border border-border rounded-xl focus:ring-2 focus:ring-primary outline-none cursor-pointer appearance-none font-medium
                        ${filterStock === 'bajo' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                  filterStock === 'sin' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-input text-foreground'}
                    `}
              value={filterStock}
              onChange={(e) => setFilterStock(e.target.value)}
            >
              <option value="todos">Stock: Todos</option>
              <option value="bajo">Stock Bajo (1-5)</option>
              <option value="sin">Sin Stock (0)</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <select
              id="sort-products"
              className="w-full h-full px-4 py-3 bg-input border border-border rounded-xl focus:ring-2 focus:ring-primary outline-none cursor-pointer appearance-none text-foreground"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="name-asc">Orden: Nombre A-Z</option>
              <option value="name-desc">Orden: Nombre Z-A</option>
              <option value="price-asc">Precio: Menor a mayor</option>
              <option value="price-desc">Precio: Mayor a menor</option>
              <option value="stock-asc">Stock: Menor a mayor</option>
              <option value="stock-desc">Stock: Mayor a menor</option>
              <option value="category-asc">Categoría: A-Z</option>
              <option value="category-desc">Categoría: Z-A</option>
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
                    <FaSearch className="text-4xl mb-2" />
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
          <div className="h-6 w-px bg-background/20"></div>
          <button
            onClick={() => setShowBulkUpdateModal(true)}
            className="bg-primary text-primary-foreground hover:opacity-90 px-4 py-2 rounded-lg font-bold shadow-sm transition-all text-sm whitespace-nowrap flex items-center gap-2"
          >
            <FaCogs /> Gestionar
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm opacity-70 hover:opacity-100 hover:text-red-400 transition-colors"
          >
            <FaTimes className="inline mr-1" /> Cancelar
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
      {showProductForm && (() => {
        const duplicateTitle = (newProduct.title && !isSubmittingProduct) ? allProductos.find(p => p.title.toLowerCase() === newProduct.title.toLowerCase()) : undefined;
        const duplicateBarcode = (newProduct.Barcode && newProduct.Barcode.trim() !== "" && !isSubmittingProduct) ? allProductos.find(p => p.Barcode === newProduct.Barcode) : undefined;
        
        return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <form onSubmit={handleAddProduct} className="bg-card border border-border p-6 rounded-2xl shadow-xl w-full max-w-lg space-y-4">
            <h2 className="text-xl font-bold">Nuevo Producto</h2>
            <div>
              <input type="text" placeholder="Título" className={`w-full p-3 border rounded-xl bg-input text-foreground ${duplicateTitle ? 'border-red-500 focus:ring-red-500' : 'border-border'}`} value={newProduct.title} onChange={(e) => setNewProduct({ ...newProduct, title: e.target.value })} required />
              {duplicateTitle && <p className="text-red-500 text-xs mt-1 font-medium pb-1">Ya existe un producto con este título.</p>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-bold mb-1 block">Precio</span>
                <input 
                  type="number" 
                  placeholder="Precio" 
                  className="w-full p-3 border border-border rounded-xl bg-input text-foreground" 
                  value={newProduct.price} 
                  onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value === "" ? ("" as unknown as number) : Number(e.target.value) })} 
                  required={categoriasMap[newProduct.category] !== "Variables"} 
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold mb-1 block">Costo</span>
                <input
                  type="number"
                  placeholder="Costo"
                  className="w-full p-3 border border-border rounded-xl bg-input text-foreground"
                  value={newProduct.cost}
                  onChange={(e) => setNewProduct({ ...newProduct, cost: e.target.value === "" ? ("" as unknown as number) : Number(e.target.value) })}
                  min="0"
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold mb-1 block">Stock</span>
                <input type="number" placeholder="Stock" className="w-full p-3 border border-border rounded-xl bg-input text-foreground" value={newProduct.stock} onChange={(e) => setNewProduct({ ...newProduct, stock: e.target.value === "" ? ("" as unknown as number) : Number(e.target.value) })} required />
              </label>
            </div>
            <select className="w-full p-3 border border-border rounded-xl bg-input text-foreground" value={newProduct.category} onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })} required >
              <option value="">Seleccionar categoría</option>
              {Object.entries(categoriasMap).sort(([, a], [, b]) => a.localeCompare(b, 'es')).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <label className="block">
              Codigo de Barras
              <input type="text" placeholder="Código de Barras" className={`w-full p-3 border rounded-xl bg-input text-foreground mt-1 ${duplicateBarcode ? 'border-red-500 focus:ring-red-500' : 'border-border'}`} value={newProduct.Barcode} onChange={(e) => setNewProduct({ ...newProduct, Barcode: e.target.value })} />
              {duplicateBarcode && <p className="text-red-500 text-xs mt-1 font-medium">Este código de barras ya existe en: {duplicateBarcode.title}</p>}
            </label>
            <div className="flex gap-2 justify-end mt-4">
              <button type="button" disabled={isSubmittingProduct} onClick={() => setShowProductForm(false)} className="px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-lg cursor-pointer">Cancelar</button>
              <button type="submit" disabled={isSubmittingProduct} className="px-4 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-lg disabled:opacity-50 cursor-pointer flex items-center gap-2">
                {isSubmittingProduct ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        </div>
        );
      })()}

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
              <button type="button" disabled={isSubmittingCategory} onClick={() => setShowCategoryForm(false)} className="px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-lg cursor-pointer">Cancelar</button>
              <button type="submit" disabled={isSubmittingCategory} className="px-4 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-lg disabled:opacity-50 cursor-pointer flex items-center gap-2">
                {isSubmittingCategory ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Editar Producto */}
      {editingProduct && (() => {
        // Código de barras original del producto que se está editando.
        // Solo avisamos por duplicado si el usuario CAMBIÓ el código a uno que choca
        // con otro producto. Si lo dejó igual, no molestamos (el conflicto, de existir,
        // ya estaba y no lo crea esta edición).
        const originalBarcode = (allProductos.find(p => p.id === editingProduct.id)?.Barcode ?? "").trim();
        const barcodeChanged = (editingProduct.Barcode ?? "").trim() !== originalBarcode;

        const duplicateTitle = (editingProduct.title && !isUpdatingProduct) ? allProductos.find(p => p.id !== editingProduct.id && p.title.toLowerCase() === editingProduct.title.toLowerCase()) : undefined;
        const duplicateBarcode = (barcodeChanged && editingProduct.Barcode && editingProduct.Barcode.trim() !== "" && !isUpdatingProduct) ? allProductos.find(p => p.id !== editingProduct.id && p.Barcode === editingProduct.Barcode) : undefined;
        
        return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <form onSubmit={handleUpdateProduct} className="bg-card border border-border p-6 rounded-2xl shadow-xl w-full max-w-lg space-y-4">
            <h2 className="text-xl font-bold">Editar Producto</h2>
            <div>
              <span className="block text-sm font-medium mb-1">Título</span>
              <input type="text" placeholder="Título" className={`w-full p-3 border rounded-xl bg-input text-foreground ${duplicateTitle ? 'border-red-500 focus:ring-red-500' : 'border-border'}`} value={editingProduct.title} onChange={(e) => setEditingProduct({ ...editingProduct, title: e.target.value })} required />
              {duplicateTitle && <p className="text-red-500 text-xs mt-1 font-medium pb-1">Ya existe otro producto con este título.</p>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-bold mb-1 block">Precio</span>
                <input 
                  type="number" 
                  placeholder="Precio" 
                  className="w-full p-3 border border-border rounded-xl bg-input text-foreground" 
                  value={editingProduct.price} 
                  onChange={(e) => setEditingProduct({ ...editingProduct, price: e.target.value === "" ? ("" as unknown as number) : Number(e.target.value) })} 
                  required={categoriasMap[editingProduct.category] !== "Variables"} 
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold mb-1 block">Costo</span>
                <input
                  type="number"
                  placeholder="Costo"
                  className="w-full p-3 border border-border rounded-xl bg-input text-foreground"
                  value={editingProduct.cost ?? 0}
                  onChange={(e) => setEditingProduct({ ...editingProduct, cost: e.target.value === "" ? ("" as unknown as number) : Number(e.target.value) })}
                  min="0"
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold mb-1 block">Stock</span>
                <input type="number" placeholder="Stock" className="w-full p-3 border border-border rounded-xl bg-input text-foreground" value={editingProduct.stock} onChange={(e) => setEditingProduct({ ...editingProduct, stock: e.target.value === "" ? ("" as unknown as number) : Number(e.target.value) })} required />
              </label>
            </div>
            <label>
              Categoría
              <select className="w-full p-3 border border-border rounded-xl bg-input text-foreground" value={editingProduct.category} onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })} required >
                <option value="">Seleccionar categoría</option>
                {Object.entries(categoriasMap).sort(([, a], [, b]) => a.localeCompare(b, 'es')).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
            <label className="block">
              Codigo de Barras
              <input type="text" placeholder="Código de Barras" className={`w-full p-3 border rounded-xl bg-input text-foreground mt-1 ${duplicateBarcode ? 'border-red-500 focus:ring-red-500' : 'border-border'}`} value={editingProduct.Barcode} onChange={(e) => setEditingProduct({ ...editingProduct, Barcode: e.target.value })} />
              {duplicateBarcode && <p className="text-red-500 text-xs mt-1 font-medium">Este código de barras ya existe en: {duplicateBarcode.title}</p>}
            </label>
            <div className="flex gap-2 justify-end mt-4">
              <button type="button" disabled={isUpdatingProduct} onClick={() => setEditingProduct(null)} className="px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button type="submit" disabled={isUpdatingProduct} className="px-4 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-lg disabled:opacity-50">
                {isUpdatingProduct ? "Actualizando..." : "Actualizar"}
              </button>
            </div>
          </form>
        </div>
        );
      })()}

      <CustomAlert
        isOpen={alertConfig.isOpen}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        showCancel={alertConfig.showCancel}
        confirmText={alertConfig.confirmText}
        onConfirm={alertConfig.onConfirm}
        onCancel={alertConfig.onCancel}
      />
    </div>
  );
};

export default Tabla;