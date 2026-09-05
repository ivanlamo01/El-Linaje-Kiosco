"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuthContext } from "../Context/AuthContext";
import {
    FaFileInvoiceDollar,
    FaSpinner,
    FaCheckCircle,
    FaExclamationTriangle,
    FaArrowLeft,
    FaPlus,
    FaTrash,
} from "react-icons/fa";
import { db } from "../config/firebase";
import { collection, addDoc, getDocs, serverTimestamp } from "firebase/firestore";
import { categoryService } from "../lib/services/categoryService";

interface ProductOption {
    id: string;
    title: string;
    price: number;
    category?: string;
    barcode?: string;
}

interface SelectedInvoiceItem {
    productId: string;
    title: string;
    price: number;
    quantity: number | string;
    category?: string;
    isCigarette?: boolean;
    tributeRate?: number;
    ivaId: number;
    ivaRate: number;
}

export default function FacturacionManual() {
    const { login, user } = useAuthContext();
    const isAdmin = Boolean(user?.isAdmin);
    const searchParams = useSearchParams();
    const prefilledImporte = searchParams.get("importe") || "";

    const [loading, setLoading] = useState(false);
    const IVA_OPTIONS = [
        { id: 5, rate: 21, label: "21% (General)" },
        { id: 4, rate: 10.5, label: "10.5%" },
        { id: 6, rate: 27, label: "27%" },
        { id: 8, rate: 5, label: "5%" },
        { id: 9, rate: 2.5, label: "2.5%" },
        { id: 3, rate: 0, label: "0% (Exento/No gravado)" },
    ];
    const [successData, setSuccessData] = useState<{ id?: string; cae?: string; vencimientoCae?: string; nroComprobante?: string; puntoVenta?: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [activePos, setActivePos] = useState<number | null>(null);
    const [products, setProducts] = useState<ProductOption[]>([]);
    const [categoryNameById, setCategoryNameById] = useState<Record<string, string>>({});
    const [productToAddQuery, setProductToAddQuery] = useState("");
    const [barcodeToAdd, setBarcodeToAdd] = useState("");
    const [quantityToAdd, setQuantityToAdd] = useState("1");
    const [selectedItems, setSelectedItems] = useState<SelectedInvoiceItem[]>([]);
    const CIGARETTE_IVA_BASE_FACTOR = 0.3;
    const formatArs = (value: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(Number.isFinite(value) ? value : 0);
    const round2 = (value: number) => Number((Number.isFinite(value) ? value : 0).toFixed(2));
    const includesCigarr = (value: unknown) => String(value || "").trim().toLowerCase().includes("cigarr");
    const resolveIsCigarette = (item: { isCigarette?: boolean; category?: string; title?: string }) => {
        if (item.isCigarette) return true;
        if (includesCigarr(item.category)) return true;
        if (item.category && includesCigarr(categoryNameById[item.category])) return true;
        if (includesCigarr(item.title)) return true;
        return false;
    };
    const getLocalDateString = (date: Date) => {
        const tzOffset = date.getTimezoneOffset() * 60000;
        return new Date(date.getTime() - tzOffset).toISOString().slice(0, 10);
    };
    const todayDateStr = getLocalDateString(new Date());
    const minAllowedDate = (() => {
        const minDate = new Date();
        minDate.setDate(minDate.getDate() - 5);
        return getLocalDateString(minDate);
    })();

    const [formData, setFormData] = useState({
        importe: prefilledImporte,
        fechaComprobante: todayDateStr,
        cbteTipo: "6", // Default B (was 11)
        docTipo: "99", // 99: Consumidor Final, 96: DNI, 80: CUIT
        docNro: "",
        ivaId: "5",
        ivaRate: "21",
        nombre: "",
        email: ""
    });

    // Update formData when URL params change (optional but good for consistency)
    useEffect(() => {
        if (prefilledImporte) {
            setFormData(prev => ({ ...prev, importe: prefilledImporte }));
        }
    }, [prefilledImporte]);

    useEffect(() => {
        const fetchActivePos = async () => {
            try {
                const res = await fetch("/api/afip/punto-venta");
                const data = await res.json();
                if (res.ok && data?.data?.puntoVenta) {
                    setActivePos(Number(data.data.puntoVenta));
                }
            } catch (fetchError) {
                console.warn("No se pudo obtener el punto de venta activo", fetchError);
            }
        };

        fetchActivePos();
    }, []);

    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const categories = await categoryService.getAll();
                const categoriesMap = categories.reduce<Record<string, string>>((acc, cat) => {
                    acc[cat.id] = String(cat.name || "");
                    return acc;
                }, {});
                setCategoryNameById(categoriesMap);

                const snapshot = await getDocs(collection(db, "Productos"));
                const loadedProducts = snapshot.docs
                    .map((productDoc) => {
                        const data = productDoc.data() as {
                            title?: string;
                            price?: number | string;
                            category?: string;
                            Barcode?: string;
                        };
                        return {
                            id: productDoc.id,
                            title: (data.title || "Sin nombre").trim(),
                            price: Number(data.price || 0),
                            category: (data.category || "").trim(),
                            barcode: (data.Barcode || "").trim(),
                        };
                    })
                    .sort((a, b) => a.title.localeCompare(b.title, "es-AR"));

                setProducts(loadedProducts);
            } catch (fetchError) {
                console.error("Error cargando productos para facturación manual:", fetchError);
            }
        };

        fetchProducts();
    }, []);

    useEffect(() => {
        if (!selectedItems.length) return;
        const total = selectedItems.reduce((acc, item) => acc + item.price * Number(item.quantity || 0), 0);
        setFormData((prev) => ({ ...prev, importe: total.toFixed(2) }));
    }, [selectedItems]);

    const getProductDisplayLabel = (product: ProductOption) => `${product.title} - $${product.price.toFixed(2)}`;

    const handleBarcodeSearch = (e?: React.FormEvent | React.KeyboardEvent) => {
        if (e) e.preventDefault();
        const search = barcodeToAdd.trim();
        if (!search) return;

        const product = products.find((p) => p.barcode === search);
        if (!product) {
            setError(`Producto con código ${search} no encontrado.`);
            setBarcodeToAdd("");
            return;
        }

        addProductToList(product);
        setBarcodeToAdd("");
        setError(null);
    };

    const addProductToList = (product: ProductOption) => {
        const qty = Number(quantityToAdd);
        const safeQty = Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1;

        setSelectedItems((prev) => {
            const existingIndex = prev.findIndex((item) => item.productId === product.id);
            if (existingIndex >= 0) {
                const cloned = [...prev];
                cloned[existingIndex] = {
                    ...cloned[existingIndex],
                    quantity: Number(cloned[existingIndex].quantity || 0) + Number(safeQty),
                };
                return cloned;
            }

            return [
                ...prev,
                {
                    productId: product.id,
                    title: product.title,
                    price: product.price,
                    quantity: safeQty,
                    category: product.category || "",
                    isCigarette: resolveIsCigarette({ category: product.category, title: product.title }),
                    tributeRate: 371.26,
                    ivaId: parseInt(formData.ivaId),
                    ivaRate: parseFloat(formData.ivaRate),
                },
            ];
        });

        setProductToAddQuery("");
        setQuantityToAdd("1");
        setError(null);
    };

    const handleAddProductToList = () => {
        const search = productToAddQuery.trim().toLowerCase();
        if (!search) return;

        const exactMatch = products.find(
            (product) => 
                getProductDisplayLabel(product).toLowerCase().trim() === search || 
                product.title.toLowerCase().trim() === search
        );

        const partialMatches = products.filter((product) =>
            product.title.toLowerCase().trim().includes(search)
        );

        const product = exactMatch || (partialMatches.length === 1 ? partialMatches[0] : null);
        if (!product) {
            setError("Seleccioná un producto válido de la lista para agregar.");
            return;
        }

        addProductToList(product);
    };

    const handleItemQuantityChange = (productId: string, quantityRaw: string) => {
        const qty = Number(quantityRaw);
        const safeQty = quantityRaw === "" ? "" : (Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1);

        setSelectedItems((prev) =>
            prev.map((item) =>
                item.productId === productId
                    ? { ...item, quantity: safeQty }
                    : item
            )
        );
    };

    const handleItemIvaChange = (productId: string, ivaId: number) => {
        const selected = IVA_OPTIONS.find((opt) => opt.id === ivaId);
        if (!selected) return;

        setSelectedItems((prev) =>
            prev.map((item) =>
                item.productId === productId
                    ? { ...item, ivaId: selected.id, ivaRate: selected.rate }
                    : item
            )
        );
    };

    const handleRemoveSelectedItem = (productId: string) => {
        setSelectedItems((prev) => {
            const nextItems = prev.filter((item) => item.productId !== productId);
            const nextTotal = nextItems.reduce((acc, item) => acc + item.price * Number(item.quantity || 0), 0);
            setFormData((prevForm) => ({
                ...prevForm,
                importe: nextItems.length > 0 ? nextTotal.toFixed(2) : "",
            }));
            return nextItems;
        });
    };

    const handleSearchPadron = async () => {
        if (!formData.docNro || formData.docTipo !== "80") return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/afip/consulta-padron?cuit=${formData.docNro}`);
            const result = await res.json();
            if (res.ok && result.data) {
                const persona = result.data;
                const razonSocial = persona.name;
                
                // Sugerir factura A si es Responsable Inscripto
                const isRI = String(persona.condition || "").toLowerCase().includes("responsable inscripto");

                setFormData(prev => ({ 
                    ...prev, 
                    nombre: razonSocial,
                    cbteTipo: isRI ? "1" : prev.cbteTipo
                }));
            } else {
                setError(result.error || "No se pudo encontrar el CUIT en el padrón.");
            }
        } catch (err) {
            setError("Error al consultar el padrón de ARCA.");
        } finally {
            setLoading(false);
        }
    };

    const filteredProducts = products.filter((product) =>
        product.title.toLowerCase().includes(productToAddQuery.trim().toLowerCase())
    );

    const importeTotal = Number(formData.importe || 0);
    const selectedIvaRate = Number(formData.ivaRate || 0);
    const taxPreview = (() => {
        const hasTax = formData.cbteTipo === "1" || formData.cbteTipo === "6";
        if (!hasTax) {
            return {
                neto: round2(importeTotal),
                iva: 0,
                tribTotal: 0,
                ivaBreakdown: {} as Record<number, { neto: number; iva: number }>
            };
        }

        if (!selectedItems.length) {
            const neto = selectedIvaRate > 0
                ? round2(importeTotal / (1 + selectedIvaRate / 100))
                : round2(importeTotal);
            const iva = round2(importeTotal - neto);
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

        for (const item of selectedItems) {
            const qty = Number(item.quantity || 0);
            const price = Number(item.price || 0);
            if (!Number.isFinite(qty) || !Number.isFinite(price) || qty <= 0 || price < 0) continue;

            const lineTotal = round2(qty * price);
            const isCigarette = resolveIsCigarette(item);
            const itemIvaRate = Number(item.ivaRate || 0);

            if (itemIvaRate <= 0) continue;

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
        }

        const tribTotal = round2(otrosImpuestos);
        const neto = round2(importeTotal - iva - tribTotal);
        return {
            neto,
            iva,
            tribTotal,
            ivaBreakdown
        };
    })();
    const cigaretteSummary = (() => {
        const cigarettes = selectedItems.filter((item) => resolveIsCigarette(item));
        const grossTotal = round2(
            cigarettes.reduce((acc, item) => acc + (Number(item.quantity || 0) * Number(item.price || 0)), 0)
        );
        const ivaBase = round2(grossTotal * CIGARETTE_IVA_BASE_FACTOR);
        const ivaAmount = selectedIvaRate > 0 ? round2(ivaBase * (selectedIvaRate / 100)) : 0;
        const notTaxed = round2(grossTotal - ivaBase - ivaAmount);
        const units = cigarettes.reduce((acc, item) => acc + Number(item.quantity || 0), 0);

        return {
            count: cigarettes.length,
            units,
            grossTotal,
            ivaBase,
            ivaAmount,
            notTaxed,
        };
    })();

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setSuccessData(null);

        // Validacion para A
        const tipo = parseInt(formData.cbteTipo);
        if (tipo === 1 && !formData.docNro) {
            setError("Para Factura A es obligatorio indicar el número de documento (CUIT/DNI).");
            setLoading(false);
            return;
        }

        if ((tipo === 1 || tipo === 6) && Number(formData.ivaId) === 3 && Number(formData.docTipo) === 99) {
            setError("No se permite IVA 0% en Factura A/B para Consumidor Final sin identificar. Indicá DNI/CUIT o seleccioná una alícuota gravada.");
            setLoading(false);
            return;
        }

        // Validación de límite para Factura B
        const LIMITE_IDENTIFICACION = 95000; // Ajustable según AFIP
        if (tipo === 6 && Number(formData.importe) > LIMITE_IDENTIFICACION && formData.docTipo === "99") {
            setError(`Para montos superiores a ${formatArs(LIMITE_IDENTIFICACION)} es obligatorio identificar al cliente en Factura B.`);
            setLoading(false);
            return;
        }

        if (formData.fechaComprobante < minAllowedDate || formData.fechaComprobante > todayDateStr) {
            setError("La fecha del comprobante debe estar entre hoy y los ultimos 5 dias.");
            setLoading(false);
            return;
        }

        try {
            let resultData;
            const invoiceItems = selectedItems.length > 0
                ? selectedItems.map((item) => ({
                    title: item.title,
                    category: resolveIsCigarette(item) ? "cigarrillos" : (item.category || ""),
                    quantity: item.quantity,
                    price: item.price,
                    isCigarette: resolveIsCigarette(item),
                    tributeRate: item.tributeRate || 371.26,
                    ivaId: item.ivaId,
                    ivaRate: item.ivaRate,
                }))
                : [
                    {
                        title: "Facturación Manual",
                        category: "",
                        quantity: 1,
                        price: parseFloat(formData.importe),
                        isCigarette: false,
                        tributeRate: 371.26,
                        ivaId: parseInt(formData.ivaId),
                        ivaRate: parseFloat(formData.ivaRate),
                    },
                ];

            if (typeof window !== 'undefined' && window.electron?.afip) {
                const resAfip = await window.electron.afip.crearFacturaC({
                    importe: parseFloat(formData.importe),
                    fechaComprobante: formData.fechaComprobante,
                    concepto: 1, // Default to Productos
                    docTipo: parseInt(formData.docTipo),
                    docNro: formData.docNro ? parseInt(formData.docNro) : 0,
                    cbteTipo: tipo,
                    ivaId: parseInt(formData.ivaId),
                    ivaRate: parseFloat(formData.ivaRate),
                    items: invoiceItems,
                });

                if (!resAfip.success) throw new Error(resAfip.error || "Error desconocido de AFIP");

                const afipData = resAfip.data as {
                    cae: string;
                    vencimientoCae: string;
                    nroComprobante: string;
                    puntoVenta: number;
                    impNeto?: number;
                    impIVA?: number;
                    impTrib?: number;
                    tributos?: Array<{ id: number; description?: string; base: number; rate: number; amount: number }>;
                };

                // Save to Firestore
                const invoiceData = {
                    ...afipData,
                    importe: parseFloat(formData.importe),
                    cbteTipo: tipo,
                    tipoComprobante: tipo,
                    docTipo: parseInt(formData.docTipo),
                    docNro: formData.docNro ? parseInt(formData.docNro) : 0,
                    nombre: formData.nombre || null,
                    email: formData.email || null,
                    items: invoiceItems,
                    impNeto: afipData.impNeto || 0,
                    impIVA: afipData.impIVA || 0,
                    impTrib: afipData.impTrib || 0,
                    tributos: afipData.tributos || [],
                    createdAt: serverTimestamp(),
                    manual: true
                };

                const docRef = await addDoc(collection(db, "facturas"), invoiceData);
                resultData = { ...invoiceData, id: docRef.id };

            } else {
                const res = await fetch("/api/afip/facturar", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        importe: parseFloat(formData.importe),
                        fechaComprobante: formData.fechaComprobante,
                        cbteTipo: tipo,
                        docTipo: parseInt(formData.docTipo),
                        docNro: formData.docNro ? parseInt(formData.docNro) : 0,
                        ivaId: parseInt(formData.ivaId),
                        ivaRate: parseFloat(formData.ivaRate),
                        items: invoiceItems,
                        nombre: formData.nombre,
                        email: formData.email,
                        concepto: 1
                    })
                });

                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.error || "Error al procesar la factura");
                }
                resultData = data.data;
            }

            setSuccessData(resultData);
            // Reset form partially
            setFormData(prev => ({ ...prev, importe: "", docNro: "", nombre: "", email: "" }));
            setSelectedItems([]);
            setProductToAddQuery("");
            setQuantityToAdd("1");

        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    if (!login) {
        return (
            <div className="flex h-screen items-center justify-center bg-background p-6">
                <div className="text-center bg-card border border-border p-8 rounded-2xl max-w-md w-full shadow-2xl">
                    <FaExclamationTriangle className="text-5xl text-muted-foreground mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-foreground mb-2">Acceso Restringido</h2>
                    <p className="text-muted-foreground">Debes iniciar sesión para facturar.</p>
                </div>
            </div>
        );
    }

    if (!isAdmin) {
        return (
            <div className="flex h-screen items-center justify-center bg-background p-6">
                <div className="text-center bg-card border border-border p-8 rounded-2xl max-w-md w-full shadow-2xl">
                    <FaExclamationTriangle className="text-5xl text-destructive mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-foreground mb-2">Acceso Denegado</h2>
                    <p className="text-muted-foreground">No tienes permisos para emitir facturas.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground p-6 lg:p-8">
            <div className="max-w-5xl mx-auto">
                <div className="mb-6">
                    <Link href="/facturas" className="text-muted-foreground hover:text-foreground flex items-center gap-2 transition-colors">
                        <FaArrowLeft /> Volver al Historial
                    </Link>
                </div>

                <div className="bg-card rounded-2xl shadow-xl p-8 border border-border">
                    <div className="flex items-center gap-4 mb-6 border-b border-border pb-6">
                        <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center text-primary text-xl shadow-sm">
                            <FaFileInvoiceDollar />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold">Facturación Manual ARCA</h1>
                            <p className="text-sm text-muted-foreground">Emití comprobantes con detalle de productos y control fiscal previo</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-6">
                        <div className="rounded-xl border border-border bg-muted/20 p-3">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total</p>
                            <p className="text-lg font-bold text-primary">{formatArs(importeTotal)}</p>
                        </div>
                        <div className="rounded-xl border border-border bg-muted/20 p-3">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">Neto gravado</p>
                            <p className="text-lg font-bold">{formatArs(taxPreview.neto)}</p>
                        </div>
                        <div className="rounded-xl border border-border bg-muted/20 p-3">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">IVA ({selectedIvaRate}%)</p>
                            <p className="text-lg font-bold">{formatArs(taxPreview.iva)}</p>
                        </div>
                        <div className="rounded-xl border border-border bg-muted/20 p-3">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">Otros tributos</p>
                            <p className="text-lg font-bold">{formatArs(taxPreview.tribTotal)}</p>
                        </div>
                        <div className="rounded-xl border border-border bg-muted/20 p-3">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">Productos seleccionados</p>
                            <p className="text-lg font-bold">{selectedItems.length}</p>
                        </div>
                    </div>

                    {error && (
                        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/30 rounded-xl flex items-start gap-3 text-destructive">
                            <FaExclamationTriangle className="mt-1" />
                            <div>
                                <p className="font-bold">Error</p>
                                <p className="text-sm">{error}</p>
                            </div>
                        </div>
                    )}

                    {successData && (
                        <div className="mb-6 p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-xl animate-in fade-in slide-in-from-top-4">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3 text-emerald-600">
                                    <FaCheckCircle className="text-2xl" />
                                    <h3 className="text-lg font-bold">¡Factura Generada con Éxito!</h3>
                                </div>
                                {successData.id && (
                                    <Link
                                        href={`/facturas/${successData.id}`}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold text-sm shadow transition-colors flex items-center gap-2"
                                    >
                                        <FaFileInvoiceDollar />
                                        Ver e Imprimir
                                    </Link>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-sm text-emerald-700">
                                <div className="bg-background p-3 rounded-lg border border-emerald-500/20">
                                    <span className="block text-xs uppercase font-bold">CAE</span>
                                    <span className="font-mono text-lg">{successData.cae}</span>
                                </div>
                                <div className="bg-background p-3 rounded-lg border border-emerald-500/20">
                                    <span className="block text-xs uppercase font-bold">Vencimiento CAE</span>
                                    <span className="font-mono text-lg">{successData.vencimientoCae}</span>
                                </div>
                                <div className="bg-background p-3 rounded-lg border border-emerald-500/20">
                                    <span className="block text-xs uppercase font-bold">Nro. Comprobante</span>
                                    <span className="font-mono text-lg">{successData.nroComprobante}</span>
                                </div>
                                <div className="bg-background p-3 rounded-lg border border-emerald-500/20">
                                    <span className="block text-xs uppercase font-bold">Punto de Venta</span>
                                    <span className="font-mono text-lg">{successData.puntoVenta}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border border-border rounded-2xl p-5 bg-muted/10">
                            <div className="md:col-span-2">
                                <h3 className="text-sm font-bold uppercase tracking-wide text-foreground mb-3">Detalle de Productos</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                                    <div>
                                        <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Buscar por Nombre</label>
                                        <input
                                            type="text"
                                            list="facturacion-productos"
                                            value={productToAddQuery}
                                            onChange={(e) => setProductToAddQuery(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    e.preventDefault();
                                                    handleAddProductToList();
                                                }
                                            }}
                                            className="w-full p-3 border border-border rounded-xl bg-background focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                                            placeholder="Nombre del producto..."
                                        />
                                        <datalist id="facturacion-productos">
                                            {filteredProducts.map((product) => (
                                                <option key={product.id} value={getProductDisplayLabel(product)} />
                                            ))}
                                        </datalist>
                                    </div>
                                    <div className="flex flex-col">
                                        <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Escanear Código de Barras</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={barcodeToAdd}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setBarcodeToAdd(val);
                                                    // Instant add if it matches exactly
                                                    if (val.trim()) {
                                                        const p = products.find(prod => String(prod.barcode).trim() === val.trim());
                                                        if (p) {
                                                            addProductToList(p);
                                                            setBarcodeToAdd("");
                                                        }
                                                    }
                                                }}
                                                onKeyDown={(e) => e.key === "Enter" && handleBarcodeSearch(e)}
                                                className="w-full p-3 border border-border rounded-xl bg-background focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                                                placeholder="Código de barras..."
                                                autoFocus
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-[1fr_120px_auto] gap-3">
                                    <div className="w-full p-3 border border-border rounded-xl bg-muted text-muted-foreground text-sm">
                                        {productToAddQuery ? `Seleccionado: ${productToAddQuery}` : "Seleccioná un producto desde el buscador"}
                                    </div>

                                    <input
                                        type="number"
                                        value={quantityToAdd}
                                        onChange={(e) => setQuantityToAdd(e.target.value)}
                                        onFocus={(e) => e.target.select()}
                                        onKeyDown={(e) => e.key === "Enter" && handleAddProductToList()}
                                        min="1"
                                        step="1"
                                        className="w-full p-3 border border-border rounded-xl bg-background focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all font-bold text-center"
                                        placeholder="Cant."
                                    />

                                    <button
                                        type="button"
                                        onClick={handleAddProductToList}
                                        className="px-4 py-3 bg-secondary text-secondary-foreground rounded-xl hover:opacity-90 transition-colors flex items-center gap-2"
                                    >
                                        <FaPlus /> Agregar
                                    </button>
                                </div>
                            </div>

                            {selectedItems.length > 0 && (
                                <div className="md:col-span-2 border border-border rounded-xl overflow-hidden bg-background">
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted/40">
                                            <tr>
                                                <th className="text-left p-3">Producto</th>
                                                <th className="text-right p-3">Precio</th>
                                                <th className="text-center p-3">Cantidad</th>
                                                <th className="text-center p-3">IVA</th>
                                                <th className="text-right p-3">Subtotal</th>
                                                <th className="text-center p-3">Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedItems.map((item) => (
                                                <tr key={item.productId} className="border-t border-border">
                                                    <td className="p-3">{item.title}</td>
                                                    <td className="p-3 text-right">${item.price.toFixed(2)}</td>
                                                    <td className="p-3 text-center">
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            step="1"
                                                            value={item.quantity}
                                                            onFocus={(e) => e.target.select()}
                                                            onChange={(e) => handleItemQuantityChange(item.productId, e.target.value)}
                                                            className="w-20 p-2 border border-border rounded-lg bg-background text-center font-bold"
                                                        />
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        <select 
                                                            value={item.ivaId} 
                                                            onChange={(e) => handleItemIvaChange(item.productId, parseInt(e.target.value))}
                                                            className="p-2 border border-border rounded-lg bg-background text-xs"
                                                        >
                                                            {IVA_OPTIONS.map(opt => (
                                                                <option key={opt.id} value={opt.id}>{opt.rate}%</option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td className="p-3 text-right">${(item.price * Number(item.quantity || 0)).toFixed(2)}</td>
                                                    <td className="p-3 text-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveSelectedItem(item.productId)}
                                                            className="text-destructive hover:opacity-80"
                                                        >
                                                            <FaTrash />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-muted-foreground mb-2">Cantidad</label>
                                <input
                                    type="number"
                                    value={selectedItems.length > 0 ? selectedItems.reduce((acc, item) => acc + Number(item.quantity || 0), 0) : 1}
                                    disabled
                                    className="w-full p-3 border border-border rounded-xl bg-muted text-muted-foreground"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-muted-foreground mb-2">Importe Total ($)</label>
                                <input
                                    type="number"
                                    name="importe"
                                    value={formData.importe}
                                    onChange={handleChange}
                                    className="w-full p-3 border border-border rounded-xl bg-background focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                                    placeholder="0.00"
                                    step="0.01"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-muted-foreground mb-2">Tipo de Factura</label>
                                <select
                                    name="cbteTipo"
                                    value={formData.cbteTipo}
                                    onChange={handleChange}
                                    className="w-full p-3 border border-border rounded-xl bg-background focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                                >
                                    <option value="6">Factura B (Resp. Inscripto - Cons Final)</option>
                                    <option value="1">Factura A (Resp. Inscripto - Resp. Inscripto)</option>
                                </select>
                            </div>
                            <div>
                                {selectedItems.length <= 1 && (
                                    <>
                                        <label className="block text-sm font-medium text-muted-foreground mb-2">Alícuota de IVA</label>
                                        <select
                                            name="ivaId"
                                            value={formData.ivaId}
                                            onChange={(e) => {
                                                const selected = IVA_OPTIONS.find((opt) => opt.id === Number(e.target.value));
                                                if (!selected) return;
                                                setFormData(prev => ({ ...prev, ivaId: String(selected.id), ivaRate: String(selected.rate) }));
                                            }}
                                            className="w-full p-3 border border-border rounded-xl bg-background focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all mb-2"
                                        >
                                            {IVA_OPTIONS.map((opt) => (
                                                <option key={opt.id} value={opt.id}>{opt.label}</option>
                                            ))}
                                        </select>
                                    </>
                                )}
                                <p className="text-xs text-muted-foreground mt-2">
                                    Punto de venta activo: {String(activePos ?? 9).padStart(5, "0")}
                                </p>
                                <div className="mt-3 rounded-xl border border-amber-400/40 bg-linear-to-br from-zinc-900 to-zinc-800 px-4 py-3 text-amber-50 shadow-lg shadow-black/25">
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
                                        <span>{formatArs(importeTotal)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border border-border rounded-2xl p-5 bg-muted/10">
                            <div className="md:col-span-3">
                                <h3 className="text-sm font-bold uppercase tracking-wide text-foreground mb-1">Datos Fiscales</h3>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-muted-foreground mb-2">Fecha de Comprobante</label>
                                <input
                                    type="date"
                                    name="fechaComprobante"
                                    value={formData.fechaComprobante}
                                    onChange={handleChange}
                                    min={minAllowedDate}
                                    max={todayDateStr}
                                    className="w-full p-3 border border-border rounded-xl bg-background focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                                    required
                                />
                                <p className="text-xs text-muted-foreground mt-2">Podés seleccionar hasta 5 dias hacia atras.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-muted-foreground mb-2">Tipo Documento</label>
                                <select
                                    name="docTipo"
                                    value={formData.docTipo}
                                    onChange={handleChange}
                                    className="w-full p-3 border border-border rounded-xl bg-background focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                                >
                                    <option value="99">Sin Identificar / Consumidor Final</option>
                                    <option value="96">DNI</option>
                                    <option value="80">CUIT</option>
                                </select>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-muted-foreground mb-2">Número de Documento</label>
                                <div className="flex gap-2">
                                    <input
                                        type="number"
                                        name="docNro"
                                        value={formData.docNro}
                                        onChange={handleChange}
                                        disabled={formData.docTipo === "99"}
                                        className="w-full p-3 border border-border rounded-xl bg-background focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all disabled:bg-muted disabled:text-muted-foreground"
                                        placeholder={formData.cbteTipo === "1" ? "Ingrese número (Obligatorio)" : "Ingrese número (Opcional)"}
                                    />
                                    {formData.docTipo === "80" && (
                                        <button
                                            type="button"
                                            onClick={handleSearchPadron}
                                            disabled={loading || !formData.docNro}
                                            className="px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl font-bold text-xs transition-colors disabled:opacity-50"
                                        >
                                            {loading ? <FaSpinner className="animate-spin" /> : "BUSCAR"}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="border border-border rounded-2xl p-5 bg-muted/10">
                            <h4 className="text-sm font-bold text-foreground mb-4">Datos Opcionales (Registro Interno)</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-muted-foreground mb-2">Nombre Cliente</label>
                                    <input
                                        type="text"
                                        name="nombre"
                                        value={formData.nombre}
                                        onChange={handleChange}
                                        className="w-full p-3 border border-border rounded-xl bg-background focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                                        placeholder="Ej: Juan Perez"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-muted-foreground mb-2">Email</label>
                                    <input
                                        type="email"
                                        name="email"
                                        value={formData.email}
                                        onChange={handleChange}
                                        className="w-full p-3 border border-border rounded-xl bg-background focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                                        placeholder="cliente@email.com"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="pt-1">
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-4 bg-primary text-primary-foreground hover:opacity-90 font-bold rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {loading ? (
                                    <>
                                        <FaSpinner className="animate-spin" />
                                        Generando Factura...
                                    </>
                                ) : (
                                    <>
                                        <FaFileInvoiceDollar />
                                        Generar Factura AFIP
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
