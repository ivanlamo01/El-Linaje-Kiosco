"use client";
import { useRouter } from "next/navigation";
import { useCart } from "../Context/CartContext";
import {
  getProductByBarcode, // Keeping for now if needed, but prefer local search
} from "../lib/services/productosServices";
import { useState, useEffect, useCallback, useRef, FormEvent } from "react";
import {
  collection,
  getDocs,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { productService } from "../lib/services/productService";
import { saleService } from "../lib/services/saleService";
import { categoryService } from "../lib/services/categoryService";
import { debtorService } from "../lib/services/debtorService"; // Added service
import { isElectron } from "../lib/utils/environment";
import { parseBarcode } from "../lib/utils/barcodeParser";
import { ProductoData } from "../types/productTypes";
import { Note } from "../types/taskTypes";
import { getNotes } from "../lib/services/notesServices";
import { FaExclamationCircle, FaSearch, FaTrash, FaShoppingCart, FaTimes, FaPrint, FaFileInvoiceDollar } from "react-icons/fa";
import TicketTemplate from "../Components/TicketTemplate";
import { Timestamp } from "firebase/firestore";
import { Sale } from "../types/saleTypes";
import ModalInput from "../Components/ModalInput";
import CustomAlert, { AlertType } from "../Components/CustomAlert";

type Product = {
  id: string;
  description?: string;
  data: ProductoData;
};

// Dummy business data (can be moved to a context or config like in other files)
const businessData = {
  name: process.env.NEXT_PUBLIC_BUSINESS_NAME || "Lo de Marta",
  cuit: process.env.NEXT_PUBLIC_BUSINESS_CUIT || "-",
  address: process.env.NEXT_PUBLIC_BUSINESS_ADDRESS || "-",
  startActivity: process.env.NEXT_PUBLIC_BUSINESS_START_ACTIVITY || undefined,
  iibb: process.env.NEXT_PUBLIC_BUSINESS_IIBB || undefined,
  condition: process.env.NEXT_PUBLIC_BUSINESS_CONDITION || "Responsable Monotributo"
};

import { useTutorial } from "../Context/TutorialContext";

function formatNoteDate(date: Note['createdAt'] | undefined): string {
  if (!date) return '';
  // Check if it's a Firestore Timestamp-like object (has seconds)
  if (typeof date === 'object' && 'seconds' in date) {
    return new Date(date.seconds * 1000).toLocaleDateString();
  }
  if (date instanceof Date) {
    return date.toLocaleDateString();
  }
  return new Date(date).toLocaleDateString();
}

function Cart() {
  const router = useRouter();
  const { cart, addToCart, removeFromCart, updateCartQuantity, clearCart } =
    useCart();
  const { startTutorial } = useTutorial();
  const [barcode, setBarcode] = useState("");
  const [title, setTitle] = useState("");
  const [total, setTotal] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [debtorName, setDebtorName] = useState("");
  const [loading, setLoading] = useState(false);

  // --- CUSTOM ALERT STATE ---
  const [alertConfig, setAlertConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: AlertType;
    showCancel: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    type: "info",
    showCancel: false,
    onConfirm: () => { },
  });

  const [paymentError, setPaymentError] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [debtors, setDebtors] = useState<{ id: string; name: string }[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  // Estado para mapear id -> nombre de categoría
  const [categoriasMap, setCategoriasMap] = useState<Record<string, string>>({});

  // Search Results State
  // Search Results State
  const [searchResults, setSearchResults] = useState<(Product & { type: "product" | "promotion" })[]>([]);
  const [showSearchModal, setShowSearchModal] = useState(false);

  // Print Modal State
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);

  // Local Catalog State (Client-side Search Index)
  const [catalog, setCatalog] = useState<(Product & { type: "product" | "promotion" })[]>([]);
  const [isCatalogLoaded, setIsCatalogLoaded] = useState(false);

  // --- CUSTOM PROMPT STATE ---
  const [promptConfig, setPromptConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    defaultValue: string;
    type: "text" | "number";
    resolve: (value: string | null) => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    defaultValue: "",
    type: "text",
    resolve: () => { },
  });

  const showPrompt = (
    title: string,
    message: string = "",
    defaultValue: string = "",
    type: "text" | "number" = "text"
  ): Promise<string | null> => {
    return new Promise((resolve) => {
      setPromptConfig({
        isOpen: true,
        title,
        message,
        defaultValue,
        type,
        resolve: (value) => {
          setPromptConfig((prev) => ({ ...prev, isOpen: false }));
          resolve(value);
        },
      });
    });
  };
  // ---------------------------

  // Load Catalog on Mount
  useEffect(() => {
    const loadCatalog = async () => {
      try {
        // 1. Fetch Products via Unified Service
        console.log("🛒 [Cart] Loading products...");
        const products = await productService.getAll();
        console.log("🛒 [Cart] Products loaded:", products.length);

        const mappedProducts = products.map(p => ({
          id: p.id,
          data: p as unknown as ProductoData,
          type: "product" as const
        }));

        let mappedPromos: (Product & { type: "product" | "promotion" })[] = [];

        if (!isElectron()) {
          const promosRef = collection(db, "promociones");
          const promosSnap = await getDocs(promosRef);
          mappedPromos = promosSnap.docs.map(doc => ({
            id: doc.id,
            data: doc.data() as ProductoData,
            type: "promotion" as const
          }));
        }

        setCatalog([...mappedProducts, ...mappedPromos]);
        setIsCatalogLoaded(true);
        console.log("🛒 [Cart] Catalog ready. Total items:", mappedProducts.length + mappedPromos.length);
      } catch (error) {
        console.error("Error loading catalog:", error);
        showAlert("danger", "Error al cargar el catálogo de productos");
      }
    };

    loadCatalog();
  }, []);

  useEffect(() => {
    const fetchNotes = async () => {
      const fetchedNotes = await getNotes();
      setNotes(fetchedNotes);
    };
    fetchNotes();
  }, []);

  useEffect(() => {
    const fetchCategorias = async () => {
      const categories = await categoryService.getAll();
      const catMap: Record<string, string> = {};
      categories.forEach((cat) => {
        catMap[cat.id] = cat.name;
      });
      setCategoriasMap(catMap);
    };
    fetchCategorias();
  }, []);

  // ✅ Cargar deudores existentes
  useEffect(() => {
    const fetchDebtors = async () => {
      try {
        const list = await debtorService.getAll();
        setDebtors(list.filter(d => !d.isClosed).map(d => ({ id: d.id, name: d.name })));
      } catch (error) {
        console.error("Error al obtener deudores:", error);
      }
    };

    fetchDebtors();
  }, []);

  const handleSearchByBarcode = async (event: FormEvent) => {
    event.preventDefault();
    if (!barcode) return;

    try {
      // 1. Parse Barcode (Standard vs Weighted)
      const parsed = parseBarcode(barcode);
      let found = null;
      let weightInGrams = 0;

      if (parsed.type === 'weighted') {
        // Search by the inner product code
        found = catalog.find((item) => item.data.Barcode === parsed.productBarcode);
        // Assuming weight in barcode is consistent with price (or is in Kg and we need to normalize?)
        // The prompt said "20-barcodedelproducto-pesodelproducto". 
        // Usually these are 20-AAAAA-PPPP (Price) or 20-AAAAA-WWWW (Weight).
        // The user example: 20-barcodedelproducto-pesodelproducto.
        // Let's assume the weight is in the same unit as the price (e.g. Price per Kg -> Weight in Kg).
        // However, previous code (manual entry) used grams. 
        // If the barcode has say 0.500 (kg), and price is $1000/kg, total is $500.
        // If the parser returns the number as is.
        weightInGrams = (parsed.weight || 0) * 1000; // Just for display if needed? 
        // Actually, let's look at how we want to add it.
        // If we add it with a custom price, we calculate it now.
      } else {
        // Standard search
        found = catalog.find((item) => item.data.Barcode === parsed.productBarcode);
      }

      if (found) {
        if (parsed.type === 'weighted' && parsed.weight !== undefined) {
          // Calculate total price: Price (per unit) * Weight
          // Assuming Price is per 1 unit (e.g. 1 Kg).
          const unitPrice = found.data.price || 0;
          const totalPrice = unitPrice * parsed.weight;

          // Format description
          const weightDisplay = parsed.weight < 1
            ? `${(parsed.weight * 1000).toFixed(0)}g`
            : `${parsed.weight.toFixed(3)}kg`;

          addToCart(
            found,
            totalPrice,
            `${found.data.title} (${weightDisplay})`,
            true // Force unique to allow multiple weighted items of same product
          );
        } else {
          handleAddToCart(found);
        }
        setBarcode("");
      } else {
        showAlert("warning", `Producto no encontrado (${parsed.productBarcode})`);
      }
    } catch (error) {
      console.error("Error al buscar el producto:", error);
    }
  };

  const handleSearchByTitle = async (event: FormEvent) => {
    event.preventDefault();
    const term = title.trim().toLowerCase();
    if (!term) return;

    // Warn if catalog isn't ready
    if (!isCatalogLoaded) {
      showAlert("info", "Cargando catálogo, intente en unos segundos...");
      return;
    }

    setLoading(true);

    // Perform local filter:
    const termClean = term.replace(/\s+/g, "");

    const results = catalog.filter(item => {
      const itemTitle = (item.data.title || "").toLowerCase();
      // Check 1: Standard includes
      if (itemTitle.includes(term)) return true;
      // Check 2: Stripped spaces
      const itemTitleClean = itemTitle.replace(/\s+/g, "");
      if (itemTitleClean.includes(termClean)) return true;

      return false;
    });

    setLoading(false);

    if (results.length === 0) {
      showAlert("warning", "Producto no encontrado");
    } else if (results.length === 1) {
      // Exact 1 match: Auto add
      handleAddToCart({
        id: results[0].id,
        data: results[0].data,
        description: results[0].data.description
      });
      setTitle("");
    } else {
      // Multiple matches: Show modal
      setSearchResults(results);
      setShowSearchModal(true);
    }
  };

  const handleSelectSearchResult = (product: Product) => {
    handleAddToCart(product);
    setShowSearchModal(false);
    setTitle("");
    setSearchResults([]);
  };

  const handleAddToCart = (product: Product) => {
    const categoryId = product.data?.category; // ID
    const categoryName = categoriasMap[categoryId] ?? ""; // Nombre

    const runAddToCart = async () => {
      if (categoryName === "Almacen" || categoryName === "Devolucion") {
        const enteredPrice = await showPrompt(
          `Precio para ${categoryName}`,
          "Ingrese el precio del producto:",
          "",
          "number"
        );

        if (enteredPrice && !isNaN(Number(enteredPrice))) {
          const enteredDescription = await showPrompt(
            `Descripción para ${categoryName}`,
            "Ingrese una descripción (opcional):",
            product.data?.description || ""
          );

          addToCart(
            product,
            parseFloat(enteredPrice),
            enteredDescription || product.data?.description || ""
          );
        } else if (enteredPrice !== null) {
          showAlert("danger", "Por favor, ingrese un precio válido.");
        }
      }
      // 🔥 Caso categoría PESO
      else if (categoryName === "peso") {
        const enteredWeight = await showPrompt(
          `Peso para ${product.data?.description || "Producto"}`,
          "Ingrese el peso en gramos:",
          "",
          "number"
        );

        if (enteredWeight && !isNaN(Number(enteredWeight))) {
          const weightGrams = parseFloat(enteredWeight);

          // ⚖️ asumimos que product.data.price es el precio por gramo
          const totalPrice = weightGrams * (product.data?.price ?? 0);

          addToCart(
            product,
            totalPrice,
            `${product.data?.description || ""}  ${weightGrams}g`,
            true // Force Unique
          );
        } else if (enteredWeight !== null) {
          showAlert("danger", "Por favor, ingrese un peso válido en gramos.");
        }
      }
      // Resto de categorías
      else {
        const existingProduct = cart.find((item) => item.id === product.id);
        if (existingProduct) {
          updateCartQuantity(product.id, existingProduct.quantity + 1);
        } else {
          addToCart(product);
        }
      }
    };

    runAddToCart();
  };

  const handleQuantityChange = (id: string, newQuantity: number) => {
    updateCartQuantity(id, newQuantity);
  };

  const handlePurchaseConfirmation = () => {
    setShowModal(true);
  };

  const triggerAlert = (
    title: string,
    message: string,
    type: AlertType = "info"
  ): Promise<void> => {
    return new Promise((resolve) => {
      setAlertConfig({
        isOpen: true,
        title,
        message,
        type,
        showCancel: false,
        onConfirm: () => {
          setAlertConfig((prev) => ({ ...prev, isOpen: false }));
          resolve();
        },
      });
    });
  };

  const showAlert = (variant: string, text: string) => {
    let type: AlertType = "info";
    let title = "Información";

    if (variant === "danger") { type = "error"; title = "Error"; }
    else if (variant === "warning") { type = "warning"; title = "Atención"; }
    else if (variant === "success") { type = "success"; title = "Éxito"; }

    triggerAlert(title, text, type);
  };

  // ✅ Confirmar compra
  const confirmPurchase = async () => {
    if (!paymentMethod) {
      setPaymentError(true);
      return;
    }

    if (paymentMethod === "Deuda" && !debtorName) {
      showAlert("danger", "Por favor, ingrese el nombre del deudor.");
      return;
    }

    if (paymentMethod === "Efectivo") {
      const efect = await showPrompt(
        "Pago en Efectivo",
        `Total a pagar: $${total.toFixed(2)}. ¿Con cuánto abona el cliente?`,
        "",
        "number"
      );

      if (efect === null) {
        // Cancelado por el usuario
        return;
      }
      const efectivoIngresado = parseFloat(efect);
      if (isNaN(efectivoIngresado) || efectivoIngresado < total) {
        showAlert("danger", "Monto ingresado inválido o insuficiente.");
        return;
      }
      const change = efectivoIngresado - total;

      // Mostrar vuelto con CustomAlert (esperamos confirmación)
      await triggerAlert("Vuelto", `El vuelto es: $${change.toFixed(2)}`, "info");
    }

    try {
      setLoading(true);

      // ✅ Actualizar stock
      for (const item of cart) {
        if (item?.data?.Barcode) {
          const productOrPromotion = await getProductByBarcode(item.data.Barcode);

          if (productOrPromotion) {
            if (productOrPromotion.data.ispromo && productOrPromotion.data.products) {
              for (const promoProduct of productOrPromotion.data.products) {
                const productInPromo = await getProductByBarcode(promoProduct.barcode);
                if (!productInPromo) continue;

                const newStock =
                  productInPromo.data.stock -
                  promoProduct.quantity * item.quantity;

                if (newStock >= 0) {
                  await productService.updateStock(productInPromo.id, newStock);
                } else {
                  showAlert(
                    "danger",
                    `No hay suficiente stock para ${productInPromo.data.title}`
                  );
                  setLoading(false);
                  return;
                }
              }
            } else {
              // --- LOGIC FOR STOCK DEDUCTION ---
              let quantityToDeduct = item.quantity;

              // If category is "peso", extract grams from description
              if (categoriasMap[productOrPromotion.data?.category] === "peso" || productOrPromotion.data?.category === "peso") {
                // Try to find "100g" pattern in description
                const match = item.customDescription?.match(/(\d+(?:\.\d+)?)g/);
                if (match && match[1]) {
                  const grams = parseFloat(match[1]);
                  // Deduct grams * quantity (usually quantity is 1 for unique items, but just in case)
                  quantityToDeduct = grams * item.quantity;
                }
              }

              const newStock = productOrPromotion.data.stock - quantityToDeduct;

              if (newStock >= 0) {
                await productService.updateStock(productOrPromotion.id, newStock);
              } else {
                showAlert(
                  "danger",
                  `No hay suficiente stock para ${productOrPromotion.data.title}`
                );
                setLoading(false);
                return;
              }
            }
          }
        }
      }

      // 🧾 Preparar objeto para el ticket
      const ticketProducts = cart.map((item) => ({
        title: item.data.title,
        description: item.customDescription || "",
        price: Number(item.customPrice ?? item.data.price ?? 0),
        quantity: item.quantity,
      }));

      const ticketSale: Sale = {
        id: "PENDIENTE", // Se actualizará si se guarda en sales
        total: total,
        date: Timestamp.fromDate(new Date()),
        paymentMethod: paymentMethod,
        products: ticketProducts
      };

      // ✅ Guardar venta si no es deuda
      if (paymentMethod !== "Deuda") {
        const saleData = {
          total: total,
          items: cart.map((item) => ({
            title: item.data.title,
            description: item.customDescription || "",
            price: Number(item.customPrice ?? item.data.price ?? 0), // Guardar como número en el array
            quantity: item.quantity,
          })),
          paymentMethod,
        };

        const result = await saleService.save(saleData);
        if (result.success && result.id) {
          ticketSale.id = result.id;
        } else {
          // Handle error if needed
          console.error("Error saving sale:", result.error);
        }
      }

      // ✅ Guardar deuda usando debtorService (Web y Native)
      if (paymentMethod === "Deuda") {
        ticketSale.paymentMethod = `Deuda: ${debtorName}`;

        const productsForDebt = cart.map((item) => ({
          title: item.data.title,
          description: item.customDescription || "",
          price: item.customPrice ?? item.data.price ?? 0,
          quantity: item.quantity,
        }));

        const result = await debtorService.addDebt(debtorName, total, productsForDebt);
        if (!result.success) {
          showAlert("danger", result.error || "Error al registrar deuda");
          setLoading(false);
          return;
        }
      }

      clearCart();
      // Guardar venta completada y mostrar modal de impresión
      setCompletedSale(ticketSale);
      setShowPrintModal(true);

      showAlert(
        "success",
        paymentMethod === "Deuda" ? "Deuda registrada" : "Compra confirmada"
      );
    } catch (error) {
      console.error("Error al confirmar la compra:", error);
      showAlert(
        "danger",
        "Error al confirmar la compra. Por favor, inténtelo de nuevo."
      );
    } finally {
      setLoading(false);
      setShowModal(false);
      inputRef.current?.focus();
    }
  };

  const handlePrintTicket = () => {
    setTimeout(() => {
      window.print();
    }, 300);
  };

  const [generatingInvoice, setGeneratingInvoice] = useState(false);

  const handleGenerateInvoice = async () => {
    if (!completedSale) return;
    setGeneratingInvoice(true);
    try {
      const res = await fetch("/api/afip/facturar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          importe: Number(completedSale.total),
          items: completedSale.products,
          docTipo: 99, // Consumidor Final default
          docNro: 0,
          cbteTipo: 11, // Factura C default
          concepto: 1,
          saleId: completedSale.id // Link invoice to sale
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al facturar");

      if (data.data && data.data.id) {
        router.push(`/facturas/${data.data.id}`);
      } else {
        showAlert("warning", "Factura creada pero no se recibió ID.");
      }

    } catch (e: unknown) {
      console.error(e);
      const err = e as Error;
      showAlert("danger", "Error al generar factura: " + err.message);
    } finally {
      setGeneratingInvoice(false);
    }
  };

  const calculateTotal = useCallback(() => {
    const total = cart.reduce(
      (acc, item) =>
        acc +
        parseFloat(String(item.customPrice ?? item.data.price ?? 0)) *
        item.quantity,
      0
    );
    setTotal(total);
  }, [cart]);

  useEffect(() => {
    calculateTotal();
  }, [cart, calculateTotal]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="min-h-screen text-foreground p-6 lg:p-8 transition-colors duration-300">
      <div className="flex flex-col lg:flex-row gap-8 max-w-[1600px] mx-auto">

        {/* --- Lado izquierdo (Productos) --- */}
        <div className="flex-1 space-y-6">

          {/* Header & Buscador */}
          <div className="bg-card border border-border p-6 rounded-2xl shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-3xl font-bold text-primary flex items-center gap-2">
                <FaShoppingCart /> Punto de Venta
              </h1>
              <button
                onClick={() => startTutorial('specific')}
                className="flex items-center gap-2 bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/40 px-3 py-1.5 rounded-lg transition-colors font-medium text-sm shadow-sm"
                title="Ver ayuda de punto de venta"
              >
                <span>❓</span>
                <span>Tutorial</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Buscar por código */}
              <form id="search-barcode-form" onSubmit={handleSearchByBarcode} className="relative group">
                <input
                  type="text"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="Escaneá código de barras..."
                  className="w-full p-4 pl-12 rounded-xl bg-input border border-input text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-muted-foreground"
                  ref={inputRef}
                />
                <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-hover:text-primary transition-colors" />
              </form>

              {/* Buscar por título */}
              <form id="search-title-form" onSubmit={handleSearchByTitle} className="relative group">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Buscar por nombre..."
                  className="w-full p-4 pl-12 rounded-xl bg-input border border-input text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-muted-foreground"
                />
                <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-hover:text-primary transition-colors" />
              </form>
            </div>
          </div>

          {/* Tabla de Productos */}
          <div id="cart-items-table" className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm min-h-[400px]">
            {loading ? (
              <div className="p-8 space-y-4 animate-pulse">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-secondary rounded-lg"></div>
                ))}
              </div>
            ) : cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground">
                <FaShoppingCart className="text-6xl mb-4 text-muted-foreground/50" />
                <p className="text-xl font-medium">El carrito está vacío</p>
                <p className="text-sm">Agregá productos para comenzar la venta</p>
              </div>
            ) : (
              <>
                <div className="flex justify-end p-4 border-b border-border">
                  <button
                    onClick={clearCart}
                    className="text-red-500 hover:text-red-600 text-sm font-semibold flex items-center gap-2 px-3 py-1 rounded-lg hover:bg-red-500/10 transition-all"
                  >
                    <FaTrash /> Vaciar todo
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-secondary text-secondary-foreground uppercase text-xs font-semibold tracking-wider">
                      <tr>
                        <th className="p-4">Producto</th>
                        <th className="p-4">Precio Unit.</th>
                        <th className="p-4">Detalle</th>
                        <th className="p-4 text-center">Cantidad</th>
                        <th className="p-4 text-right">Subtotal</th>
                        <th className="p-4 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {cart.map((item) => {
                        const price = Number(item.customPrice ?? item.data.price);
                        return (
                          <tr
                            key={`${item.id}-${item.customDescription}`}
                            className="group hover:bg-muted/50 transition-colors"
                          >
                            <td className="p-4">
                              <div className="font-medium text-foreground">{item.data.title}</div>
                              <div className="text-xs text-muted-foreground">{item.data.Barcode}</div>
                            </td>
                            <td className="p-4 text-muted-foreground">
                              ${price.toFixed(2)}
                            </td>
                            <td className="p-4 text-muted-foreground text-sm italic">
                              {item.customDescription || '-'}
                            </td>
                            <td className="p-4">
                              <div className="flex items-center justify-center">
                                <input
                                  type="number"
                                  min="1"
                                  value={item.quantity}
                                  onChange={(e) =>
                                    handleQuantityChange(
                                      item.id,
                                      Math.max(1, parseInt(e.target.value) || 1)
                                    )
                                  }
                                  onFocus={(e) => e.target.select()}
                                  className="w-16 p-2 text-center bg-input border border-border rounded-lg text-foreground focus:border-primary outline-none"
                                />
                              </div>
                            </td>
                            <td className="p-4 text-right font-bold text-primary">
                              ${(price * item.quantity).toFixed(2)}
                            </td>
                            <td className="p-4 text-center">
                              <button
                                onClick={() => removeFromCart(item.id)}
                                className="text-muted-foreground hover:text-destructive p-2 rounded-full hover:bg-secondary transition-all"
                                title="Eliminar del carrito"
                              >
                                <FaTrash />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>

        {/* --- Lado derecho (Resumen) --- */}
        <div className="w-full lg:w-96 space-y-6">

          {/* Card Total */}
          <div id="cart-summary" className="bg-card border border-border p-6 rounded-2xl shadow-sm sticky top-6">
            <h3 className="text-xl font-bold text-foreground mb-6 border-b border-border pb-4">
              Resumen de Venta
            </h3>

            <div className="flex justify-between items-end mb-2">
              <span className="text-muted-foreground">Total a Pagar</span>
              <span className="text-4xl font-extrabold text-primary">${total.toFixed(2)}</span>
            </div>
            <div className="text-right text-xs text-muted-foreground mb-8">
              {cart.length} items en el carrito
            </div>

            <button
              id="confirm-sale-btn"
              onClick={handlePurchaseConfirmation}
              disabled={cart.length === 0}
              className={`w-full py-4 rounded-xl font-bold text-lg shadow-md transition-all transform active:scale-95 ${cart.length === 0
                ? "bg-secondary text-muted-foreground cursor-not-allowed"
                : "bg-primary text-primary-foreground hover:opacity-90 shadow-primary/20"
                }`}
            >
              Confirmar Compra ➔
            </button>
          </div>

          {/* Notas Importantes */}
          {notes.length > 0 && (
            <div className="bg-card border border-border p-6 rounded-2xl shadow-sm">
              <h4 className="text-primary font-bold mb-4 flex items-center gap-2">
                <FaExclamationCircle /> Notas Importantes
              </h4>
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className={`p-3 rounded-xl border-l-4 ${note.importance === 'high'
                      ? 'border-red-500 bg-red-500/10'
                      : note.importance === 'medium'
                        ? 'border-yellow-500 bg-yellow-500/10'
                        : 'border-blue-500 bg-blue-500/10'
                      }`}
                  >
                    <p className="font-bold text-foreground">{note.title || "Nota"}</p>
                    <p className="text-muted-foreground text-sm mt-1 mb-2">{note.content}</p>
                    <div className="flex justify-between text-[10px] text-muted-foreground uppercase tracking-wide">
                      <span>{formatNoteDate(note.createdAt)}</span>
                      {note.deadline && (
                        <span className="text-amber-500 font-semibold">
                          Vence: {formatNoteDate(note.deadline)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* --- Modal confirmación --- */}
      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center/80 backdrop-blur-sm z-50 p-4 animate-fade-in">
          <div className="bg-card border border-border rounded-2xl p-8 w-full max-w-md shadow-2xl animate-scale-up">
            <h3 className="text-2xl font-bold text-foreground mb-6">Confirmar Compra</h3>

            <div className="space-y-4">
              <div>
                <label className="block mb-2 text-sm font-medium text-muted-foreground">Método de pago</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full p-3 bg-input border border-input rounded-xl text-foreground focus:border-primary outline-none cursor-pointer"
                >
                  <option value="">Seleccione...</option>
                  <option value="Efectivo">💵 Efectivo</option>
                  <option value="Transferencia">💳 Transferencia</option>
                  <option value="Deuda">📝 Deuda (Cuenta Corriente)</option>
                </select>
              </div>

              {paymentError && !paymentMethod && (
                <p className="text-destructive text-sm">
                  ⚠️ Debe seleccionar un método de pago
                </p>
              )}

              {paymentMethod === "Deuda" && (
                <div className="animate-fade-in">
                  <label className="block mb-2 text-sm font-medium text-muted-foreground">
                    Cliente / Deudor
                  </label>
                  <input
                    type="text"
                    value={debtorName}
                    onChange={(e) => setDebtorName(e.target.value)}
                    list="debtors-list"
                    className="w-full p-3 bg-input border border-input rounded-xl text-foreground focus:border-primary outline-none"
                    placeholder="Escribí el nombre..."
                  />
                  <datalist id="debtors-list">
                    {debtors.map((d) => (
                      <option key={d.id} value={d.name} />
                    ))}
                  </datalist>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-3 bg-secondary hover:bg-secondary/80 text-foreground rounded-xl font-bold transition-colors"
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                onClick={confirmPurchase}
                className="flex-1 py-3 bg-primary text-primary-foreground hover:opacity-90 rounded-xl font-bold transition-colors shadow-md"
                disabled={loading}
              >
                {loading ? "Procesando..." : "Confirmar ($" + total.toFixed(2) + ")"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Custom Alert Modal --- */}
      <CustomAlert
        isOpen={alertConfig.isOpen}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        showCancel={alertConfig.showCancel}
        onConfirm={alertConfig.onConfirm}
        onCancel={() => setAlertConfig((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* --- Modal Input Custom --- */}
      <ModalInput
        isOpen={promptConfig.isOpen}
        title={promptConfig.title}
        message={promptConfig.message}
        defaultValue={promptConfig.defaultValue}
        type={promptConfig.type}
        onConfirm={(val) => promptConfig.resolve(val)}
        onCancel={() => promptConfig.resolve(null)}
      />

      {/* --- Modal Búsqueda de Productos (Disambiguation) --- */}
      {showSearchModal && (
        <div className="fixed inset-0 flex items-center justify-center/80 backdrop-blur-sm z-50 p-4 animate-fade-in">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-2xl shadow-2xl animate-scale-up max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                <FaSearch className="text-primary" /> Resultados de Búsqueda
              </h3>
              <button onClick={() => setShowSearchModal(false)} className="text-muted-foreground hover:text-foreground">
                <FaTimes size={24} />
              </button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              Se encontraron {searchResults.length} productos que coinciden con &quot;{title}&quot;. Seleccione uno para agregar al carrito.
            </p>

            <div className="overflow-y-auto custom-scrollbar flex-1 space-y-2">
              {searchResults.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSelectSearchResult(item)}
                  className="w-full text-left p-4 rounded-xl bg-secondary/50 hover:bg-primary/10 border border-transparent hover:border-primary transition-all group flex justify-between items-center"
                >
                  <div>
                    <p className="font-bold text-foreground group-hover:text-primary transition-colors uppercase">
                      {item.data.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.data.category || "Sin categoría"} • {item.type === 'promotion' ? 'Promoción' : 'Producto'}
                    </p>
                    {item.data.Barcode && <p className="text-xs text-muted-foreground mt-0.5 font-mono">BC: {item.data.Barcode}</p>}
                    {item.data.description && <p className="text-xs text-muted-foreground mt-1 italic">{item.data.description}</p>}
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold text-primary">${item.data.price}</span>
                    <div className="text-xs text-muted-foreground">Stock: {item.data.stock}</div>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-border flex justify-end">
              <button
                onClick={() => setShowSearchModal(false)}
                className="px-6 py-2 rounded-lg font-bold text-muted-foreground hover:bg-secondary transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🧾 Modal de Impresión de Ticket */}
      {showPrintModal && completedSale && (
        <div className="fixed inset-0 flex items-center justify-center/80 backdrop-blur-sm z-100 p-4 animate-fade-in print:bg-white print:p-0">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl animate-scale-up text-center print:hidden">
            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
              <FaPrint />
            </div>
            <h3 className="text-2xl font-bold text-foreground mb-2">¡Venta Exitosa!</h3>
            <p className="text-muted-foreground mb-6">
              ¿Desea imprimir el ticket de la venta?
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => setShowPrintModal(false)}
                className="py-3 bg-secondary hover:bg-secondary/80 text-foreground rounded-xl font-bold transition-colors"
                disabled={generatingInvoice}
              >
                Cerrar
              </button>

              <button
                onClick={handlePrintTicket}
                className="py-3 bg-primary text-primary-foreground hover:opacity-90 rounded-xl font-bold transition-colors shadow-md flex items-center justify-center gap-2"
                disabled={generatingInvoice}
              >
                <FaPrint /> Imprimir Ticket
              </button>

              <button
                onClick={handleGenerateInvoice}
                className="py-3 bg-blue-600 text-white hover:bg-blue-700 col-span-1 md:col-span-2 rounded-xl font-bold transition-colors shadow-md flex items-center justify-center gap-2"
                disabled={generatingInvoice}
              >
                {generatingInvoice ? "Generando..." : (
                  <>
                    <FaFileInvoiceDollar /> Facturar (AFIP)
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Template hidden from UI but visible for Print */}
          <div className="hidden print:block absolute top-0 left-0 w-full bg-white h-screen">
            <style>{`
                    @media print {
                        nav, header, aside, .sidebar, footer { display: none !important; }
                        main { margin: 0 !important; padding: 0 !important; }
                        @page { margin: 0; size: auto; }
                    }
                `}</style>
            <TicketTemplate sale={completedSale} businessData={businessData} />
          </div>
        </div>
      )}
    </div>
  );
}

export default Cart;
