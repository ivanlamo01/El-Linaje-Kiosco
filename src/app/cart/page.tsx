"use client";
import { useRouter } from "next/navigation";
import { useCart } from "../Context/CartContext";
import {
  getProductByBarcode, // Keeping for now if needed, but prefer local search
  getById,
} from "../lib/services/productosServices";
import { useState, useEffect, useCallback, useRef, FormEvent } from "react";
import {
  collection,
  getDocs,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { productService } from "../lib/services/productService";
import { saleService } from "../lib/services/saleService";
import { categoryService } from "../lib/services/categoryService";
import { debtorService } from "../lib/services/debtorService"; // Added service
import { isElectron, isOnline } from "../lib/utils/environment";
import { parseBarcode } from "../lib/utils/barcodeParser";
import { ProductoData } from "../types/productTypes";
import { calculateStockDeduction, calculatePromoComponentDeduction, normalizeCategoryName } from "../lib/services/stockDeduction";
import { Note } from "../types/taskTypes";
import { getNotes } from "../lib/services/notesServices";
import { FaExclamationCircle, FaFileInvoiceDollar, FaPrint, FaQuestionCircle, FaSearch, FaShoppingCart, FaTimes, FaTrash } from "react-icons/fa";
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
  name: process.env.NEXT_PUBLIC_BUSINESS_NAME || "El Linaje Kiosko",
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
  const [searchResults, setSearchResults] = useState<(Product & { type: "product" | "promotion" })[]>([]);
  const [showSearchModal, setShowSearchModal] = useState(false);

  // --- AUTOCOMPLETE STATE ---
  const [suggestions, setSuggestions] = useState<(Product & { type: "product" | "promotion" })[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  // ---------------------------

  // Print Modal State
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [isPrintingTicket, setIsPrintingTicket] = useState(false);
  const printTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Billing Modal State ---
  const [showBillingModal, setShowBillingModal] = useState(false);
  const IVA_OPTIONS = [
    { id: 5, rate: 21, label: "21% (General)" },
    { id: 4, rate: 10.5, label: "10.5%" },
    { id: 6, rate: 27, label: "27%" },
    { id: 8, rate: 5, label: "5%" },
    { id: 9, rate: 2.5, label: "2.5%" },
    { id: 3, rate: 0, label: "0% (Exento/No gravado)" },
  ];
  const [billingData, setBillingData] = useState({
      cbteTipo: 6, // Default B
      docTipo: 99,
      docNro: "",
      ivaId: 5,
      ivaRate: 21,
      nombre: "",
      email: ""
  });
  const [itemIvaOverrides, setItemIvaOverrides] = useState<Record<number, { ivaId: number; ivaRate: number }>>({});
  const CIGARETTE_IVA_BASE_FACTOR = 0.3;
  const [activePos, setActivePos] = useState<number | null>(null);
  const formatArs = (value: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(Number.isFinite(value) ? value : 0);
  const round2 = (value: number) => Number((Number.isFinite(value) ? value : 0).toFixed(2));
  const isCigaretteItem = (item: Sale["products"][number]) => {
    if (item.isCigarette) return true;
    return String(item.category || "").trim().toLowerCase() === "cigarrillos";
  };
  
  const [excludedItems, setExcludedItems] = useState<Set<number>>(new Set());

  const billingTotal = Number(completedSale?.products?.reduce((acc, p, idx) => {
    if (excludedItems.has(idx)) return acc;
    return acc + (Number(p.price || 0) * Number(p.quantity || 0));
  }, 0) || 0);

  const selectedIvaRate = Number(billingData.ivaRate || 0);
  const taxPreview = (() => {
    const hasTax = billingData.cbteTipo === 1 || billingData.cbteTipo === 6;
    if (!hasTax) {
      return {
        neto: round2(billingTotal),
        iva: 0,
        tribTotal: 0,
        ivaBreakdown: {} as Record<number, { neto: number; iva: number }>
      };
    }

    const allProducts = completedSale?.products || [];
    const products = allProducts.filter((_, idx) => !excludedItems.has(idx));

    if (!products.length) {
      const neto = selectedIvaRate > 0
        ? round2(billingTotal / (1 + selectedIvaRate / 100))
        : round2(billingTotal);
      const iva = round2(billingTotal - neto);
      return {
        neto,
        iva,
        tribTotal: 0,
        ivaBreakdown: selectedIvaRate > 0 ? { [selectedIvaRate]: { neto, iva } } : {}
      };
    }

    let iva = 0;
    let otrosImpuestos = 0;
    const ivaBreakdown: Record<number, { neto: number; iva: number }> = {};

    allProducts.forEach((item, idx) => {
      if (excludedItems.has(idx)) return;
      
      const qty = Number(item.quantity || 0);
      const price = Number(item.price || 0);
      if (!Number.isFinite(qty) || !Number.isFinite(price) || qty <= 0 || price < 0) return;

      const lineTotal = round2(qty * price);
      const isCigarette = isCigaretteItem(item);
      
      const override = itemIvaOverrides[idx];
      const itemIvaRate = Number(override?.ivaRate ?? item.ivaRate ?? billingData.ivaRate);

      if (itemIvaRate <= 0) return;

      let itemIva = 0;
      let itemNeto = 0;

      if (isCigarette) {
        const taxablePortion = round2(lineTotal * CIGARETTE_IVA_BASE_FACTOR);
        const taxableNet = round2(taxablePortion / (1 + itemIvaRate / 100));
        itemIva = round2(taxablePortion - taxableNet);
        itemNeto = taxableNet;
        const otrosBase = round2(lineTotal - taxablePortion);
        otrosImpuestos = round2(otrosImpuestos + otrosBase);
      } else {
        itemNeto = round2(lineTotal / (1 + itemIvaRate / 100));
        itemIva = round2(lineTotal - itemNeto);
      }

      iva = round2(iva + itemIva);

      if (!ivaBreakdown[itemIvaRate]) {
        ivaBreakdown[itemIvaRate] = { neto: 0, iva: 0 };
      }
      ivaBreakdown[itemIvaRate].neto = round2(ivaBreakdown[itemIvaRate].neto + itemNeto);
      ivaBreakdown[itemIvaRate].iva = round2(ivaBreakdown[itemIvaRate].iva + itemIva);
    });

    const tribTotal = round2(otrosImpuestos);
    const neto = round2(billingTotal - iva - tribTotal);

    return {
      neto,
      iva,
      tribTotal,
      ivaBreakdown
    };
  })();

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

  // --- AUTOCOMPLETE LOGIC ---
  useEffect(() => {
    const term = title.trim().toLowerCase();
    if (!term || term.length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const termClean = term.replace(/\s+/g, "");

    const filtered = catalog.filter(item => {
      const itemTitle = (item.data.title || "").toLowerCase();
      if (itemTitle.includes(term)) return true;
      const itemTitleClean = itemTitle.replace(/\s+/g, "");
      if (itemTitleClean.includes(termClean)) return true;
      return false;
    }).slice(0, 10); // Limit to 10 suggestions

    setSuggestions(filtered);
    setShowSuggestions(filtered.length > 0);
    setSelectedIndex(-1);
  }, [title, catalog]);
  // ---------------------------

  // Load Catalog on Mount
  useEffect(() => {
    const loadCatalog = async () => {
      try {
        // 1. Fetch Products via Unified Service
        console.log("[Cart] Loading products...");
        const products = await productService.getAll();
        console.log("[Cart] Products loaded:", products.length);

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
        console.log("[Cart] Catalog ready. Total items:", mappedProducts.length + mappedPromos.length);
      } catch (error) {
        console.error("Error loading catalog:", error);
        showAlert("danger", "Error al cargar el catálogo de productos");
      }
    };

    loadCatalog();
  }, []);

  // Suscripción en tiempo real (solo online): mantiene el stock y los datos de los
  // productos del catálogo al instante, reflejando ventas/ediciones de otras cajas.
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
          const liveProducts: (Product & { type: "product" | "promotion" })[] = [];
          for (const d of snapshot.docs) {
            if (seen.has(d.id)) continue;
            seen.add(d.id);
            liveProducts.push({
              id: d.id,
              data: d.data() as ProductoData,
              type: "product" as const,
            });
          }
          // Conservamos las promociones ya cargadas y reemplazamos los productos evitando duplicados.
          setCatalog((prev) => {
            const promotions = prev.filter((item) => item.type === "promotion" && !seen.has(item.id));
            return [...liveProducts, ...promotions];
          });
          setIsCatalogLoaded(true);
        },
        (error) => {
          console.error("[Cart] Error en la suscripción en vivo de productos:", error);
        }
      );
    })();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
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

  // Cargar deudores existentes
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

      if (parsed.type === 'weighted') {
        // Search by the inner product code
        found = catalog.find((item) => item.data.Barcode === parsed.productBarcode);
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
    setShowSuggestions(false);
    setSelectedIndex(-1);
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter") {
      if (selectedIndex >= 0) {
        e.preventDefault();
        const selected = suggestions[selectedIndex];
        handleAddToCart({
          id: selected.id,
          data: selected.data,
          description: selected.data.description
        });
        setTitle("");
        setShowSuggestions(false);
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  const handleSelectSuggestion = (selected: (Product & { type: "product" | "promotion" })) => {
    handleAddToCart({
      id: selected.id,
      data: selected.data,
      description: selected.data.description
    });
    setTitle("");
    setShowSuggestions(false);
  };

  const handleAddToCart = (product: Product) => {
    const categoryId = product.data?.category; // ID
    const categoryName = categoriasMap[categoryId] ?? ""; // Nombre
    const normalizedCategoryName = categoryName.trim().toLowerCase();

    const runAddToCart = async () => {
      if (
        normalizedCategoryName === "variable" ||
        normalizedCategoryName === "variables" ||
        normalizedCategoryName === "devolucion" ||
        normalizedCategoryName === "devolución"
      ) {
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
            enteredDescription || product.data?.description || "",
            true
          );
        } else if (enteredPrice !== null) {
          showAlert("danger", "Por favor, ingrese un precio válido.");
        }
      }
      // Caso categoría PESO
      else if (normalizedCategoryName === "peso") {
        const enteredWeight = await showPrompt(
          `Peso para ${product.data?.description || "Producto"}`,
          "Ingrese el peso en gramos:",
          "",
          "number"
        );

        if (enteredWeight && !isNaN(Number(enteredWeight))) {
          const weightGrams = parseFloat(enteredWeight);

          // Asumimos que product.data.price es el precio por gramo
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

  // Confirmar compra
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
      const lowStockProducts: string[] = [];

      // Actualizar stock
      for (const item of cart) {
        // Buscar el producto/promoción por Barcode; si no tiene Barcode (o no se
        // encontró), caer al id real del producto guardado en el carrito. Antes,
        // los productos sin Barcode se saltaban el descuento de stock en silencio.
        let productOrPromotion = item?.data?.Barcode
          ? await getProductByBarcode(item.data.Barcode)
          : null;

        if (!productOrPromotion && item.productId) {
          const byId = await getById(item.productId);
          if (byId) {
            productOrPromotion = { ...byId, type: "product" };
          }
        }

        if (productOrPromotion) {
          if (productOrPromotion.data.isPromo && productOrPromotion.data.products) {
            for (const promoProduct of productOrPromotion.data.products) {
              const productInPromo = await getProductByBarcode(promoProduct.barcode);
              if (!productInPromo) continue;

              const { newStock, isLowStock } = calculatePromoComponentDeduction({
                currentStock: productInPromo.data.stock,
                promoQuantityPerUnit: promoProduct.quantity,
                cartQuantity: item.quantity,
              });

              // Allow sale even if stock is negative
              await productService.updateStock(productInPromo.id, newStock);

              if (isLowStock) {
                lowStockProducts.push(`${productInPromo.data.title} (Queda: ${newStock.toFixed(2)})`);
              }
            }
          } else {
            // If category is "peso", extract grams from description
            const categoryName = normalizeCategoryName(categoriasMap[productOrPromotion.data?.category] || productOrPromotion.data?.category);

            const { newStock, isLowStock } = calculateStockDeduction({
              currentStock: productOrPromotion.data.stock,
              quantity: item.quantity,
              isWeighted: categoryName === "peso",
              customDescription: item.customDescription,
            });

            // Allow sale even if stock is negative
            await productService.updateStock(productOrPromotion.id, newStock);

            if (isLowStock) {
              lowStockProducts.push(`${productOrPromotion.data.title} (Queda: ${newStock.toFixed(2)})`);
            }
          }
        }
      }

      // Show low stock warnings if any
      if (lowStockProducts.length > 0) {
        await triggerAlert(
          "Aviso de Revisión o Recarga",
          "Los siguientes productos tienen stock bajo:\n" + lowStockProducts.join("\n"),
          "warning"
        );
      }

      // 🧾 Preparar objeto para el ticket
      const ticketProducts = cart.map((item) => ({
        category: String(categoriasMap[item.data.category] || "").trim().toLowerCase(),
        isCigarette: String(categoriasMap[item.data.category] || "").trim().toLowerCase() === "cigarrillos",
        tributeRate: 371.26,
        ivaId: item.data.ivaId || 5, // Default 21% if missing
        ivaRate: item.data.ivaRate || 21,
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

      // Guardar venta si no es deuda
      if (paymentMethod !== "Deuda") {
        const saleData = {
          total: total,
          items: cart.map((item) => ({
            category: String(categoriasMap[item.data.category] || "").trim().toLowerCase(),
            isCigarette: String(categoriasMap[item.data.category] || "").trim().toLowerCase() === "cigarrillos",
            tributeRate: 371.26,
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

      // Guardar deuda usando debtorService (Web y Native)
      if (paymentMethod === "Deuda") {
        ticketSale.paymentMethod = `Deuda: ${debtorName}`;

        const productsForDebt = cart.map((item) => ({
          category: String(categoriasMap[item.data.category] || "").trim().toLowerCase(),
          isCigarette: String(categoriasMap[item.data.category] || "").trim().toLowerCase() === "cigarrillos",
          tributeRate: 371.26,
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
    if (isPrintingTicket) return;

    setIsPrintingTicket(true);
    printTimeoutRef.current = setTimeout(() => {
      window.print();
    }, 300);
  };

  useEffect(() => {
    const handleAfterPrint = () => {
      setIsPrintingTicket(false);

      if (printTimeoutRef.current) {
        clearTimeout(printTimeoutRef.current);
        printTimeoutRef.current = null;
      }
    };

    window.addEventListener("afterprint", handleAfterPrint);

    return () => {
      window.removeEventListener("afterprint", handleAfterPrint);

      if (printTimeoutRef.current) {
        clearTimeout(printTimeoutRef.current);
      }
    };
  }, []);

  const [generatingInvoice, setGeneratingInvoice] = useState(false);

  const handleGenerateInvoice = async () => {
    if (!completedSale) return;
    
    // Open Billing Modal first
    setShowPrintModal(false); // Close print modal to show billing modal
    setExcludedItems(new Set()); // Reset exclusions
    setItemIvaOverrides({}); // Reset overrides
    setBillingData({
        cbteTipo: 6, // Default B
        docTipo: 99,
        docNro: "",
      ivaId: 5,
      ivaRate: 21,
      nombre: "",
      email: ""
    });
    setShowBillingModal(true);
  };

  const confirmGenerateInvoice = async () => {
    if (!completedSale) return;

    // Basic validation
    if (billingData.cbteTipo === 1 && !billingData.docNro) {
        showAlert("danger", "Para Factura A es obligatorio el número de documento (CUIT/DNI).");
        return;
    }

    if ((billingData.cbteTipo === 1 || billingData.cbteTipo === 6) && billingData.ivaId === 3 && billingData.docTipo === 99) {
      showAlert("danger", "No se permite IVA 0% en Factura A/B para Consumidor Final sin identificar. Indicá DNI/CUIT o seleccioná una alícuota gravada.");
      return;
    }

    setShowBillingModal(false);
    setGeneratingInvoice(true);
    try {
      const res = await fetch("/api/afip/facturar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          importe: Number(billingTotal),
          items: completedSale.products
            .map((item, idx) => ({ ...item, originalIdx: idx }))
            .filter((item) => !excludedItems.has(item.originalIdx))
            .map((item) => {
              const override = itemIvaOverrides[item.originalIdx];
              return {
                ...item,
                ivaId: override ? override.ivaId : (item.ivaId || billingData.ivaId),
                ivaRate: override ? override.ivaRate : (item.ivaRate || billingData.ivaRate),
              };
            }),
          docTipo: Number(billingData.docTipo),
          docNro: Number(billingData.docNro || 0),
          cbteTipo: Number(billingData.cbteTipo),
          nombre: billingData.nombre,
          email: billingData.email,
          ivaId: Number(billingData.ivaId),
          ivaRate: Number(billingData.ivaRate),
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
    const fetchActivePos = async () => {
      try {
        const res = await fetch("/api/afip/punto-venta");
        const data = await res.json();
        if (res.ok && data?.data?.puntoVenta) {
          setActivePos(Number(data.data.puntoVenta));
        }
      } catch (error) {
        console.warn("No se pudo obtener el punto de venta activo", error);
      }
    };

    fetchActivePos();
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground p-6 lg:p-8 transition-colors duration-300">
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
                <FaQuestionCircle />
                <span>Tutorial</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Buscar por código */}
              <form id="search-barcode-form" onSubmit={handleSearchByBarcode} className="relative group">
                <input
                  type="text"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value.replace(/[^0-9]/g, ""))}
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
                  onKeyDown={handleKeyDown}
                  onFocus={() => title.length > 0 && setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder="Buscar por nombre..."
                  className="w-full p-4 pl-12 rounded-xl bg-input border border-input text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-muted-foreground"
                />
                <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-hover:text-primary transition-colors" />

                {/* Autocomplete Suggestions */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-2 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden max-h-[400px] overflow-y-auto">
                    {suggestions.map((item, index) => (
                      <div
                        key={item.id}
                        className={`p-4 cursor-pointer flex justify-between items-center transition-colors border-b last:border-0 border-border
                          ${index === selectedIndex ? 'bg-primary/20 bg-muted-foreground/10' : 'hover:bg-muted/50'}
                        `}
                        onClick={() => handleSelectSuggestion(item)}
                        onMouseEnter={() => setSelectedIndex(index)}
                      >
                        <div>
                          <p className="font-bold text-foreground">{item.data.title}</p>
                          <p className="text-xs text-muted-foreground">{item.data.Barcode} • {categoriasMap[item.data.category] || 'Sin categoría'}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-primary">${item.data.price}</p>
                          <p className={`text-[10px] ${item.data.stock <= 5 ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>
                            Stock: {item.data.stock}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
        <div className="fixed inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50 p-4 animate-fade-in">
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
                  <option value="Efectivo">Efectivo</option>
                  <option value="Transferencia">Transferencia</option>
                  <option value="Deuda">Deuda (Cuenta Corriente)</option>
                </select>
              </div>

              {paymentError && !paymentMethod && (
                <p className="text-destructive text-sm flex items-center gap-2">
                  <FaExclamationCircle /> Debe seleccionar un método de pago
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
        <div className="fixed inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50 p-4 animate-fade-in">
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
        <div className="fixed inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-100 p-4 animate-fade-in print:bg-white print:p-0">
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
                disabled={generatingInvoice || isPrintingTicket}
              >
                <FaPrint /> {isPrintingTicket ? "Abriendo impresión..." : "Imprimir Ticket"}
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
          <div className="hidden print:block absolute top-0 left-0 w-full bg-white">
            <style>{`
                    @media print {
                        nav, header, aside, .sidebar, footer { display: none !important; }
                        main { margin: 0 !important; padding: 0 !important; }
                        html, body { margin: 0 !important; padding: 0 !important; width: 72mm !important; }
                        body * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                        @page { margin: 0; size: 72mm auto; }
                    }
                `}</style>
            <TicketTemplate sale={completedSale} businessData={businessData} />
          </div>
        </div>
      )}

      {/* 🧾 Modal de Facturación */}
      {showBillingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-md rounded-2xl shadow-xl border border-border flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-border">
              <h3 className="text-xl font-bold text-card-foreground">Generar Factura AFIP</h3>
              <p className="text-muted-foreground text-sm mt-1">Seleccione el tipo de comprobante y destinatario.</p>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="bg-muted/30 p-4 rounded-xl border border-border">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center justify-between">
                  Productos a Facturar
                  <span className="text-primary normal-case">Total: {formatArs(billingTotal)}</span>
                </h4>
                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                  {completedSale?.products?.map((item, idx) => {
                    const override = itemIvaOverrides[idx];
                    const currentIvaId = override ? override.ivaId : (item.ivaId || billingData.ivaId);
                    
                    return (
                      <div key={idx} className="flex flex-col gap-2 p-3 bg-card rounded-lg border border-border/50 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={!excludedItems.has(idx)}
                              onChange={() => {
                                const newSet = new Set(excludedItems);
                                if (newSet.has(idx)) newSet.delete(idx);
                                else newSet.add(idx);
                                setExcludedItems(newSet);
                              }}
                              className="w-4 h-4 text-primary rounded border-input focus:ring-primary h-4 w-4"
                            />
                            <span className="truncate flex-1 font-medium">{item.title}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-muted-foreground text-xs whitespace-nowrap">x{item.quantity}</span>
                            <span className="font-bold text-primary">{formatArs(Number(item.price) * (Number(item.quantity) || 1))}</span>
                          </div>
                        </div>
                        
                        {!excludedItems.has(idx) && (
                          <div className="flex items-center gap-2 pl-7">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold">IVA:</span>
                            <select
                              className="bg-muted text-[11px] border border-border rounded px-1 py-0.5 outline-none focus:border-primary"
                              value={currentIvaId}
                              onChange={(e) => {
                                const selected = IVA_OPTIONS.find(opt => opt.id === Number(e.target.value));
                                if (selected) {
                                  setItemIvaOverrides(prev => ({
                                    ...prev,
                                    [idx]: { ivaId: selected.id, ivaRate: selected.rate }
                                  }));
                                }
                              }}
                            >
                              {IVA_OPTIONS.map(opt => (
                                <option key={opt.id} value={opt.id}>{opt.label}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Tipo de Factura</label>
                <select
                  className="w-full p-3 rounded-xl bg-input border border-input outline-none focus:border-primary"
                  value={billingData.cbteTipo}
                  onChange={(e) => setBillingData({ ...billingData, cbteTipo: Number(e.target.value) })}
                >
                  <option value={6}>Factura B</option>
                  <option value={1}>Factura A</option>
                </select>
              </div>

              {((completedSale?.products || []).filter((_, idx) => !excludedItems.has(idx)).length <= 1) && (
                <div>
                  <label className="block text-sm font-medium mb-2">Alícuota de IVA Global</label>
                  <select
                    className="w-full p-3 rounded-xl bg-input border border-input outline-none focus:border-primary"
                    value={billingData.ivaId}
                    onChange={(e) => {
                      const selected = IVA_OPTIONS.find(opt => opt.id === Number(e.target.value));
                      if (selected) {
                        setBillingData({ ...billingData, ivaId: selected.id, ivaRate: selected.rate });
                      }
                    }}
                  >
                    {IVA_OPTIONS.map(opt => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Vista Previa de Impuestos Detallada */}
              {taxPreview.ivaBreakdown && Object.keys(taxPreview.ivaBreakdown).length > 0 ? (
                <div className="bg-muted/20 p-4 rounded-xl border border-border space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Resumen de Impuestos</h4>
                  {Object.entries(taxPreview.ivaBreakdown).map(([rate, data]) => (
                    <div key={rate} className="flex justify-between text-sm py-1 border-b border-border/50 last:border-0">
                      <span className="text-muted-foreground">IVA {rate}%</span>
                      <div className="text-right">
                        <p className="font-medium">Base: {formatArs(data.neto)}</p>
                        <p className="font-bold text-primary">Cuota: {formatArs(data.iva)}</p>
                      </div>
                    </div>
                  ))}
                  {taxPreview.tribTotal > 0 && (
                    <div className="flex justify-between text-sm py-1 border-b border-border/50">
                      <span className="text-muted-foreground">Otros Impuestos</span>
                      <div className="text-right">
                        <p className="font-bold text-amber-500">{formatArs(taxPreview.tribTotal)}</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                selectedIvaRate > 0 && (
                  <div className="bg-muted/20 p-4 rounded-xl border border-border space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Resumen de Impuestos</h4>
                    <div className="flex justify-between text-sm py-1 border-b border-border/50 last:border-0">
                      <span className="text-muted-foreground">IVA {selectedIvaRate}%</span>
                      <div className="text-right">
                        <p className="font-medium">Base: {formatArs(taxPreview.neto)}</p>
                        <p className="font-bold text-primary">Cuota: {formatArs(taxPreview.iva)}</p>
                      </div>
                    </div>
                  </div>
                )
              )}

              <p className="text-xs text-muted-foreground mt-2">
                Punto de venta activo: {String(activePos ?? 9).padStart(5, "0")}
              </p>
              <div className="mt-3 rounded-xl border border-amber-400/40 bg-gradient-to-br from-zinc-900 to-zinc-800 px-4 py-3 text-amber-50 shadow-lg shadow-black/25">
                <div className="flex items-center justify-between text-lg font-semibold">
                  <span>Subtotal Neto:</span>
                  <span>{formatArs(taxPreview.neto)}</span>
                </div>
                
                {taxPreview.ivaBreakdown && Object.keys(taxPreview.ivaBreakdown).length > 0 ? (
                  Object.entries(taxPreview.ivaBreakdown).map(([rate, data]) => (
                    <div key={rate} className="mt-2 border-l-2 border-amber-300/70 pl-3 text-sm">
                      <p className="font-semibold text-amber-200">IVA {rate}%</p>
                      <p className="flex items-center justify-between"><span>Base:</span><span>{formatArs(data.neto)}</span></p>
                      <p className="flex items-center justify-between"><span>Cuota:</span><span>{formatArs(data.iva)}</span></p>
                    </div>
                  ))
                ) : (
                  <div className="mt-2 border-l-2 border-amber-300/70 pl-3 text-sm">
                    <p className="font-semibold text-amber-200">IVA {selectedIvaRate}%</p>
                    <p className="flex items-center justify-between"><span>Base:</span><span>{formatArs(taxPreview.neto)}</span></p>
                    <p className="flex items-center justify-between"><span>Cuota:</span><span>{formatArs(taxPreview.iva)}</span></p>
                  </div>
                )}

                <div className="mt-2 border-l-2 border-amber-500/70 pl-3 text-sm">
                  <p className="flex items-center justify-between"><span>Otros impuestos:</span><span>{formatArs(taxPreview.tribTotal)}</span></p>
                </div>
                <div className="mt-3 flex items-center justify-between text-3xl font-extrabold tracking-tight">
                  <span>Total:</span>
                  <span>{formatArs(billingTotal)}</span>
                </div>
              </div>

              {billingData.cbteTipo === 1 && (
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg text-sm text-blue-600 dark:text-blue-400">
                  ℹ️ Para Factura A es obligatorio ingresar DNI o CUIT.
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">Tipo de Documento</label>
                <select
                  className="w-full p-3 rounded-xl bg-input border border-input outline-none focus:border-primary"
                  value={billingData.docTipo}
                  onChange={(e) => setBillingData({ ...billingData, docTipo: Number(e.target.value) })}
                >
                  <option value={99}>Sin Identificar / Consumidor Final</option>
                  <option value={96}>DNI</option>
                  <option value={80}>CUIT</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Número de Documento</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    className="w-full p-3 rounded-xl bg-input border border-input outline-none focus:border-primary"
                    placeholder="Ingrese DNI o CUIT sin guiones"
                    value={billingData.docNro}
                    onChange={(e) => setBillingData({ ...billingData, docNro: e.target.value })}
                  />
                  {billingData.docTipo === 80 && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!billingData.docNro) return;
                        setLoading(true);
                        try {
                          const res = await fetch(`/api/afip/consulta-padron?cuit=${billingData.docNro}`);
                          const result = await res.json();
                          if (res.ok && result.data) {
                            const persona = result.data;
                            const isRI = String(persona.condition || "").toLowerCase().includes("responsable inscripto");
                            
                            setBillingData(prev => ({ 
                              ...prev, 
                              cbteTipo: isRI ? 1 : prev.cbteTipo 
                            }));
                            showAlert("success", `Contribuyente: ${persona.name}`);
                          } else {
                            showAlert("warning", result.error || "No se pudo encontrar el CUIT.");
                          }
                        } catch {
                          showAlert("danger", "Error al consultar padrón.");
                        } finally {
                          setLoading(false);
                        }
                      }}
                      disabled={loading || !billingData.docNro}
                      className="px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl font-bold text-xs transition-colors disabled:opacity-50"
                    >
                      {loading ? <FaExclamationCircle className="animate-spin" /> : "BUSCAR"}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-border flex justify-end gap-3 bg-muted/20 rounded-b-2xl">
              <button
                onClick={() => {
                   setShowBillingModal(false);
                   setShowPrintModal(true); // Return to print modal
                }}
                className="px-4 py-2 hover:bg-accent hover:text-accent-foreground rounded-lg transition-colors"
                disabled={generatingInvoice}
              >
                Cancelar
              </button>
              <button
                onClick={confirmGenerateInvoice}
                className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg shadow-sm font-medium"
                disabled={generatingInvoice}
              >
                Emitir Factura
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Cart;
