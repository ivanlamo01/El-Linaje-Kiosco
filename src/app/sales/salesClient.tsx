"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTutorial } from "../Context/TutorialContext";
import { getSalesByRange, deleteSale } from "../lib/sales";
import CustomAlert, { AlertType } from "../Components/CustomAlert";
import { Sale as SaleType } from "../types/saleTypes";
import Pagination from "../Components/Pagination";
import TicketTemplate from "../Components/TicketTemplate";
import InvoicedTicketTemplate from "../Components/InvoicedTicketTemplate";
import { InvoiceData } from "../Components/InvoiceTemplate";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import { FaCalendarAlt, FaSearch, FaChevronDown, FaChevronUp, FaMoneyBillWave, FaCreditCard, FaReceipt, FaShoppingBag, FaPrint, FaFileInvoiceDollar, FaSpinner, FaQuestion, FaTrash, FaArrowUp } from "react-icons/fa";

interface Props {
    initialSales: SaleType[];
}

export default function SalesClient({ initialSales }: Props) {
    const { startTutorial } = useTutorial();
    const router = useRouter();
    const [sales, setSales] = useState<SaleType[]>(initialSales);
    const [loading, setLoading] = useState(false);
    const [facturandoId, setFacturandoId] = useState<string | null>(null);
    const [paymentFilter, setPaymentFilter] = useState("all");
    const [invoicedFilter, setInvoicedFilter] = useState("all");
    const [dateMode, setDateMode] = useState<"rango" | "exacta">("rango");
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [saleToPrint, setSaleToPrint] = useState<SaleType | null>(null);
    const [isPrintingTicket, setIsPrintingTicket] = useState(false);
    const printTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // --- Billing Modal State ---
    const [showBillingModal, setShowBillingModal] = useState(false);
    const [isBulkBilling, setIsBulkBilling] = useState(false);
    const [billingSale, setBillingSale] = useState<SaleType | null>(null);
    const IVA_OPTIONS = [
        { id: 5, rate: 21, label: "21% (General)" },
        { id: 4, rate: 10.5, label: "10.5%" },
        { id: 6, rate: 27, label: "27%" },
        { id: 8, rate: 5, label: "5%" },
        { id: 9, rate: 2.5, label: "2.5%" },
        { id: 3, rate: 0, label: "0% (Exento/No gravado)" },
    ];
    const [billingData, setBillingData] = useState({
        cbteTipo: 6, // Default B (was 11)
        docTipo: 99,  // Default Consumidor Final
        docNro: "",
        ivaId: 5,
        ivaRate: 21,
        nombre: "",
        email: ""
    });
    const CIGARETTE_IVA_BASE_FACTOR = 0.3;
    const [itemIvaOverrides, setItemIvaOverrides] = useState<Record<string, { ivaId: number; ivaRate: number }>>({});
    const [activePos, setActivePos] = useState<number | null>(null);
    const [excludedProducts, setExcludedProducts] = useState<Set<string>>(new Set());
    
    const formatArs = (value: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(Number.isFinite(value) ? value : 0);
    const round2 = (value: number) => Number((Number.isFinite(value) ? value : 0).toFixed(2));
    const isCigaretteItem = (item: SaleType["products"][number]) => {
        if (item.isCigarette) return true;
        return String(item.category || "").trim().toLowerCase() === "cigarrillos";
    };

    const selectedIvaRate = Number(billingData.ivaRate || 0);
    const selectedSales = isBulkBilling
        ? sales.filter((sale) => selectedIds.has(sale.id))
        : (billingSale ? [billingSale] : []);
        
    const filteredSelectedProducts = selectedSales.flatMap((sale) => 
        (sale.products || []).map((p, idx) => ({ ...p, saleId: sale.id, originalIndex: idx }))
    ).filter(p => !excludedProducts.has(`${p.saleId}-${p.originalIndex}`));

    const billingTotal = filteredSelectedProducts.reduce((acc, p) => acc + (Number(p.price || 0) * Number(p.quantity || 0)), 0);

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

        if (!filteredSelectedProducts.length) {
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

        for (const item of filteredSelectedProducts) {
            const qty = Number(item.quantity || 0);
            const price = Number(item.price || 0);
            if (!Number.isFinite(qty) || !Number.isFinite(price) || qty <= 0 || price < 0) continue;

            const lineTotal = round2(qty * price);
            const isCigarette = isCigaretteItem(item);
            
            const key = `${item.saleId}-${item.originalIndex}`;
            const override = itemIvaOverrides[key];
            const itemIvaRate = Number(override?.ivaRate ?? (item as any).ivaRate ?? billingData.ivaRate);

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
        const neto = round2(billingTotal - iva - tribTotal);

        return {
            neto,
            iva,
            tribTotal,
            ivaBreakdown
        };
    })();

    // --- Bulk Selection ---
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const handleSelectSale = (id: string, checked: boolean) => {
        const newSelected = new Set(selectedIds);
        if (checked) {
            newSelected.add(id);
        } else {
            newSelected.delete(id);
        }
        setSelectedIds(newSelected);
    };

    // Alert State
    const [alertProps, setAlertProps] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type?: AlertType;
        showCancel?: boolean;
        confirmText?: string;
        isLoading?: boolean;
        onConfirm: () => void;
        onCancel?: () => void;
    }>({
        isOpen: false,
        title: "",
        message: "",
        onConfirm: () => { },
    });

    const closeAlert = () => setAlertProps((prev) => ({ ...prev, isOpen: false }));

    const showAlert = (title: string, message: string, type: AlertType = "info") => {
        setAlertProps({
            isOpen: true,
            title,
            message,
            type,
            showCancel: false,
            confirmText: "Entendido",
            onConfirm: closeAlert,
        });
    };

    const showConfirm = (title: string, message: string, onConfirmAction: () => Promise<void> | void, type: AlertType = "warning", confirmText = "Confirmar") => {
        setAlertProps({
            isOpen: true,
            title,
            message,
            type,
            showCancel: true,
            confirmText,
            isLoading: false,
            onConfirm: async () => {
                setAlertProps(prev => ({ ...prev, isLoading: true }));
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

    const businessData = {
        name: process.env.NEXT_PUBLIC_BUSINESS_NAME || "GALVAN VALERIA ALDANA",
        cuit: process.env.NEXT_PUBLIC_BUSINESS_CUIT || "27313918144",
        address: process.env.NEXT_PUBLIC_BUSINESS_ADDRESS || "-",
        startActivity: process.env.NEXT_PUBLIC_BUSINESS_START_ACTIVITY || undefined,
        iibb: process.env.NEXT_PUBLIC_BUSINESS_IIBB || undefined,
        condition: process.env.NEXT_PUBLIC_BUSINESS_CONDITION || "Responsable Inscripto",
    };

    const [invoiceToPrint, setInvoiceToPrint] = useState<InvoiceData | null>(null);

    const handlePrintTicket = async (sale: SaleType) => {
        if (isPrintingTicket) return;
        setIsPrintingTicket(true);

        if (sale.facturaId) {
            try {
                const snap = await getDoc(doc(db, "facturas", sale.facturaId));
                setInvoiceToPrint(snap.exists() ? (snap.data() as InvoiceData) : null);
            } catch {
                setInvoiceToPrint(null);
            }
        } else {
            setInvoiceToPrint(null);
        }

        setSaleToPrint(sale);
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

    const handleFacturar = async (sale: SaleType) => {
        setBillingSale(sale);
        setIsBulkBilling(false);
        setExcludedProducts(new Set());
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

    const handleBulkFacturar = async () => {
        if (selectedIds.size === 0) return;
        setIsBulkBilling(true);
        setShowBillingModal(true);
        setExcludedProducts(new Set());
        setItemIvaOverrides({});
        setBillingData({
            cbteTipo: 6,
            docTipo: 99,
            docNro: "",
            ivaId: 5,
            ivaRate: 21,
            nombre: "",
            email: ""
        });
    };

    const confirmFacturar = async () => {
        // Basic validation
        if (billingData.cbteTipo === 1 && !billingData.docNro) {
            showAlert("Error", "Para Factura A es obligatorio el número de documento (CUIT/DNI).", "error");
            return;
        }

        if ((billingData.cbteTipo === 1 || billingData.cbteTipo === 6) && billingData.ivaId === 3 && billingData.docTipo === 99) {
            showAlert("Error", "No se permite IVA 0% en Factura A/B para Consumidor Final sin identificar. Indicá DNI/CUIT o seleccioná una alícuota gravada.", "error");
            return;
        }

        setShowBillingModal(false);

        if (isBulkBilling) {
            await processBulkFacturar();
        } else if (billingSale) {
            await facturarSingle(billingSale, false, billingData);
        }
    };

    const processBulkFacturar = async () => {
        setLoading(true);
        let successCount = 0;
        let failCount = 0;

        // Process sequentially to avoid overwhelming the API
        const ids = Array.from(selectedIds);
        for (const id of ids) {
            const sale = sales.find(s => s.id === id);
            if (sale) {
                const res = await facturarSingle(sale, true, billingData);
                if (res.success) successCount++;
                else failCount++;
            }
        }

        setLoading(false);
        setSelectedIds(new Set()); // Clear selection
        showAlert("Proceso Finalizado", `Se generaron ${successCount} facturas exitosamente. ${failCount > 0 ? `${failCount} fallaron.` : ""}`, successCount > 0 ? "success" : "error");
    };

    const facturarSingle = async (
        sale: SaleType,
        silent = false,
        options = { cbteTipo: 6, docTipo: 99, docNro: 0 as string | number, ivaId: 5, ivaRate: 21, nombre: "", email: "" }
    ): Promise<{ success: boolean; id?: string; error?: string }> => {
        if (!silent) setFacturandoId(sale.id);
        try {
            const itemsToFacturar = (sale.products || [])
                .map((p, idx) => ({ ...p, originalIdx: idx }))
                .filter((item) => !excludedProducts.has(`${sale.id}-${item.originalIdx}`))
                .map((item) => {
                    const key = `${sale.id}-${item.originalIdx}`;
                    const override = itemIvaOverrides[key];
                    return {
                        ...item,
                        ivaId: override ? override.ivaId : ((item as any).ivaId || options.ivaId),
                        ivaRate: override ? override.ivaRate : ((item as any).ivaRate || options.ivaRate),
                    };
                });
            
            if (itemsToFacturar.length === 0) return { success: true };

            const currentImporte = itemsToFacturar.reduce((acc, p) => acc + (p.price * p.quantity), 0);

            const res = await fetch("/api/afip/facturar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    importe: Number(currentImporte),
                    items: itemsToFacturar,
                    docTipo: Number(options.docTipo),
                    docNro: Number(options.docNro || 0),
                    cbteTipo: Number(options.cbteTipo),
                    nombre: options.nombre,
                    email: options.email,
                    concepto: 1,
                    saleId: sale.id // Pass the sale ID to link it
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Error al facturar");

            if (data.data && data.data.id) {
                // Update local state to reflect the new invoice
                setSales(prevSales => prevSales.map(s =>
                    s.id === sale.id
                        ? { ...s, facturaId: data.data.id }
                        : s
                ));
            }

            if (!silent) {
                if (data.data && data.data.id) {
                    router.push(`/facturas/${data.data.id}`);
                } else {
                    showAlert("Atención", "Factura creada, pero no se recibió ID.", "warning");
                }
            }
            return { success: true, id: data.data?.id };

        } catch (e) {
            const message = e instanceof Error ? e.message : "Error desconocido";
            if (!silent) showAlert("Error", "Error al facturar: " + message, "error");
            return { success: false, error: message };
        } finally {
            if (!silent) setFacturandoId(null);
        }
    };

    const handleDelete = (saleId: string) => {
        showConfirm(
            "Eliminar Venta",
            "¿Estás seguro de que deseas eliminar esta venta permanentemente? Esta acción NO se puede deshacer.",
            () => executeDelete(saleId),
            "error",
            "Eliminar"
        );
    };

    const executeDelete = async (saleId: string) => {
        try {
            const res = await deleteSale(saleId);
            if (!res.success) throw new Error(res.error || "No se pudo eliminar");

            setSales(prev => prev.filter(s => s.id !== saleId));

            if (expanded === saleId) setExpanded(null);
            showAlert("Éxito", "Venta eliminada correctamente.", "success");
        } catch (err: unknown) {
            showAlert("Error", "Error al eliminar venta: " + (err instanceof Error ? err.message : String(err)), "error");
        }
    };

    // --- 🔑 Paginación ---
    const [currentPage, setCurrentPage] = useState(1);
    const salesPerPage = 10; // cantidad de ventas por página

    // --- Filtros Derivados ---
    const filteredSales = useMemo(() => {
        return sales.filter((s) => {
            if (paymentFilter !== "all" && paymentFilter !== "Todos") {
                if (paymentFilter === "Deuda") {
                    if (!String(s.paymentMethod || "").startsWith("Deuda")) return false;
                } else if (String(s.paymentMethod || "").trim().toLowerCase() !== paymentFilter.toLowerCase()) {
                    return false;
                }
            }
            if (invoicedFilter === "invoiced" && !s.facturaId) return false;
            if (invoicedFilter === "not_invoiced" && s.facturaId) return false;
            return true;
        });
    }, [sales, paymentFilter, invoicedFilter]);

    const displayTotal = useMemo(() => {
        if (isSelectionMode) {
            return sales
                .filter(s => selectedIds.has(s.id))
                .reduce((acc, s) => acc + Number(s.total || 0), 0);
        }
        return filteredSales.reduce((acc, s) => acc + Number(s.total || 0), 0);
    }, [isSelectionMode, selectedIds, filteredSales, sales]);

    // Calcular índice de los productos a mostrar
    const indexOfLastSale = currentPage * salesPerPage;
    const indexOfFirstSale = indexOfLastSale - salesPerPage;
    const currentSales = filteredSales.slice(indexOfFirstSale, indexOfLastSale);

    useEffect(() => {
        setCurrentPage(1);
    }, [filteredSales]);

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            const allIds = new Set(currentSales.map(s => s.id));
            setSelectedIds(allIds);
        } else {
            setSelectedIds(new Set());
        }
    };

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

    // Check if all displayed are selected
    const isAllSelected = currentSales.length > 0 && currentSales.every(s => selectedIds.has(s.id));

    const handleFilter = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        setLoading(true);

        if (dateMode === "exacta") {
            const dateStr = formData.get("exactDate") as string;
            if (!dateStr) {
                setLoading(false);
                return;
            }
            const [y, m, d] = dateStr.split('-').map(Number);
            const start = new Date(y, m - 1, d, 0, 0, 0, 0);
            const end = new Date(y, m - 1, d, 23, 59, 59, 999);
            const res = await getSalesByRange(start, end);
            setSales(res);
        } else {
            const startDate = formData.get("start") as string;
            const endDate = formData.get("end") as string;
            if (!startDate || !endDate) {
                setLoading(false);
                return;
            }
            const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
            const start = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
            const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
            const end = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);
            const res = await getSalesByRange(start, end);
            setSales(res);
        }

        setLoading(false);
    };

    return (
        <>
            <div className="min-h-screen bg-background text-foreground p-6 lg:p-8 transition-colors duration-300 print:hidden">
                <div className="max-w-6xl mx-auto space-y-6">

                    {/* Header */}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-border">
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 id="sales-page-title" className="text-3xl font-bold text-primary flex items-center gap-3">
                                    <FaReceipt /> Historial de Ventas
                                </h1>
                                <button
                                    onClick={() => startTutorial('specific')}
                                    className="flex items-center gap-2 bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/40 px-3 py-1.5 rounded-lg transition-colors font-medium text-sm shadow-sm"
                                    title="Ver ayuda de inventario"
                                >
                                    <FaQuestion />
                                    <span>Tutorial</span>
                                </button>
                            </div>
                            <p className="text-muted-foreground mt-1">Consulta y filtra los movimientos de venta</p>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <button
                                onClick={() => {
                                    if (isSelectionMode) setSelectedIds(new Set());
                                    setIsSelectionMode(!isSelectionMode);
                                }}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all shadow-sm border text-sm ${isSelectionMode ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground hover:bg-muted border-border'}`}
                            >
                                {isSelectionMode ? "Desactivar Selección" : "Activar Selección"}
                            </button>
                            <div id="sales-total-card" className={`border px-6 py-3 rounded-xl flex flex-col items-end shadow-sm ${isSelectionMode ? 'bg-primary/10 border-primary' : 'bg-card border-border'}`}>
                                <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">
                                    {isSelectionMode ? "Total Seleccionado" : "Total en Rango"}
                                </span>
                                <div className="flex items-center gap-2">
                                    <FaArrowUp className="text-emerald-500" size={18} />
                                    <span className={`text-2xl font-bold ${isSelectionMode ? 'text-primary' : 'text-foreground'}`}>${displayTotal.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* --- Filtros --- */}
                    <div id="sales-filter-section" className="bg-card border border-border p-6 rounded-2xl shadow-sm">
                        <h3 className="text-lg font-bold text-card-foreground mb-4 flex items-center gap-2">
                            <FaSearch className="text-muted-foreground" /> Filtros de Búsqueda
                        </h3>
                        <form onSubmit={handleFilter} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
                            <div className="w-full">
                                <label className="text-sm font-medium text-muted-foreground mb-1 block">Búsqueda</label>
                                <select
                                    value={dateMode}
                                    onChange={(e) => setDateMode(e.target.value as "rango" | "exacta")}
                                    className="w-full p-3 rounded-xl bg-input border border-input text-foreground outline-none transition-colors"
                                >
                                    <option value="rango">Rango</option>
                                    <option value="exacta">Exacta</option>
                                </select>
                            </div>
                            {dateMode === "exacta" ? (
                                <div className="w-full lg:col-span-2">
                                    <label className="text-sm font-medium text-muted-foreground mb-1 block">Fecha</label>
                                    <div className="relative">
                                        <FaCalendarAlt className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                        <input
                                            type="date"
                                            name="exactDate"
                                            className="w-full pl-10 pr-4 py-3 rounded-xl bg-input border border-input text-foreground focus:border-primary outline-none transition-colors"
                                        />
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="w-full">
                                        <label className="text-sm font-medium text-muted-foreground mb-1 block">Desde</label>
                                        <div className="relative">
                                            <FaCalendarAlt className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                            <input
                                                type="date"
                                                name="start"
                                                className="w-full pl-10 pr-4 py-3 rounded-xl bg-input border border-input text-foreground focus:border-primary outline-none transition-colors"
                                            />
                                        </div>
                                    </div>
                                    <div className="w-full">
                                        <label className="text-sm font-medium text-muted-foreground mb-1 block">Hasta</label>
                                        <div className="relative">
                                            <FaCalendarAlt className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                            <input
                                                type="date"
                                                name="end"
                                                className="w-full pl-10 pr-4 py-3 rounded-xl bg-input border border-input text-foreground focus:border-primary outline-none transition-colors"
                                            />
                                        </div>
                                    </div>
                                </>
                            )}
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-primary text-primary-foreground hover:opacity-90 font-bold px-4 py-3 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                            >
                                <FaSearch />
                            </button>
                            <div className="w-full">
                                <label className="text-sm font-medium text-muted-foreground mb-1 block">Facturación</label>
                                <select
                                    value={invoicedFilter}
                                    onChange={(e) => setInvoicedFilter(e.target.value)}
                                    className="w-full p-3 rounded-xl bg-input border border-input text-foreground outline-none transition-colors"
                                >
                                    <option value="all">Todas</option>
                                    <option value="invoiced">Facturadas</option>
                                    <option value="not_invoiced">No Factur</option>
                                </select>
                            </div>
                            <div className="w-full">
                                <label className="text-sm font-medium text-muted-foreground mb-1 block">Pago</label>
                                <select
                                    value={paymentFilter}
                                    onChange={(e) => setPaymentFilter(e.target.value)}
                                    className="w-full p-3 rounded-xl bg-input border border-input text-foreground outline-none transition-colors"
                                >
                                    <option value="all">Todas</option>
                                    <option value="Efectivo">Efectivo</option>
                                    <option value="Transferencia">Transf</option>
                                    <option value="Deuda">Cta Cte</option>
                                </select>
                            </div>
                        </form>
                    </div>

                    {/* --- Bulk Actions Bar --- */}
                    {isSelectionMode && selectedIds.size > 0 && (
                        <div className="sticky top-4 z-10 bg-primary/10 backdrop-blur-md border border-primary/20 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 shadow-lg">
                            <div className="flex items-center gap-3">
                                <span className="bg-primary text-primary-foreground text-sm font-bold px-3 py-1 rounded-full">
                                    {selectedIds.size}
                                </span>
                                <span className="font-medium text-foreground">seleccionados</span>
                            </div>
                            <div className="flex items-center gap-2 w-full sm:w-auto">
                                <button
                                    onClick={handleBulkFacturar}
                                    disabled={loading}
                                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:opacity-90 px-4 py-2 rounded-lg font-bold shadow-sm transition-transform active:scale-95"
                                >
                                    {loading ? <FaSpinner className="animate-spin" /> : <FaFileInvoiceDollar />}
                                    Facturar Seleccionadas
                                </button>
                                <button
                                    onClick={() => setSelectedIds(new Set())}
                                    className="px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-background/50 rounded-lg transition-colors"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    )}

                    {/* --- Listado --- */}
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-muted-foreground animate-pulse">Buscando ventas...</p>
                        </div>
                    ) : filteredSales.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground border border-dashed border-border rounded-2xl">
                            <FaReceipt className="text-6xl mb-4 text-muted-foreground/50" />
                            <p className="text-xl">No se encontraron ventas</p>
                            <p className="text-sm">Prueba ajustando los filtros o el rango de fechas</p>
                        </div>
                    ) : (
                        <div id="sales-list-container" className="space-y-4">
                            {/* Select All Row */}
                            {isSelectionMode && currentSales.length > 0 && (
                                <div className="flex items-center gap-3 px-4 py-2">
                                    <input
                                        type="checkbox"
                                        checked={isAllSelected}
                                        onChange={(e) => handleSelectAll(e.target.checked)}
                                        className="w-5 h-5 text-primary rounded focus:ring-primary bg-input border-muted"
                                    />
                                    <span className="text-sm font-medium text-muted-foreground">Seleccionar todo en esta página</span>
                                </div>
                            )}

                            {currentSales.map((sale, i) => (
                                <div
                                    key={sale.id}
                                    id={i === 0 ? "first-sale-card" : undefined}
                                    className={`bg-card border rounded-2xl p-6 shadow-sm hover:border-primary/50 transition-all group ${isSelectionMode && selectedIds.has(sale.id) ? 'border-primary bg-primary/5' : 'border-border'}`}
                                >
                                    {/* Cabecera */}
                                    <div className="flex items-center gap-4">
                                        {isSelectionMode && (
                                            <div className="flex items-center h-full" onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(sale.id)}
                                                    onChange={(e) => handleSelectSale(sale.id, e.target.checked)}
                                                    className="w-5 h-5 text-primary rounded focus:ring-primary bg-input border-muted cursor-pointer"
                                                />
                                            </div>
                                        )}

                                        <div
                                            id={i === 0 ? "first-sale-header" : undefined}
                                            className="grid grid-cols-1 md:grid-cols-4 gap-6 items-center cursor-pointer flex-1"
                                            onClick={() => setExpanded(expanded === sale.id ? null : sale.id)}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="p-3 bg-secondary rounded-lg text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                                    <FaCalendarAlt />
                                                </div>
                                                <div>
                                                    <p className="text-xs text-muted-foreground uppercase font-bold">Fecha</p>
                                                    <p className="text-card-foreground font-medium">
                                                        {new Date(sale.date.seconds * 1000).toLocaleString("es-AR", {
                                                            day: "2-digit",
                                                            month: "2-digit",
                                                            year: "numeric",
                                                            hour: "2-digit",
                                                            minute: "2-digit",
                                                        })}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                <div className="p-3 bg-secondary rounded-lg text-muted-foreground">
                                                    {sale.paymentMethod === 'Efectivo' ? <FaMoneyBillWave /> : <FaCreditCard />}
                                                </div>
                                                <div>
                                                    <p className="text-xs text-muted-foreground uppercase font-bold">Pago</p>
                                                    <p className="text-card-foreground font-medium bg-muted px-2 py-0.5 rounded text-sm inline-block mt-0.5">
                                                        {sale.paymentMethod}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Status Badge - Shows if invoiced */}
                                            <div className="flex gap-4 items-center md:items-end justify-center">
                                                {sale.facturaId ? (
                                                    <div className="flex items-center gap-1.5 px-3 py-1 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg text-xs font-bold border border-green-200 dark:border-green-900/50" title="Venta ya facturada ante AFIP">
                                                        <FaFileInvoiceDollar size={14} /> Facturado
                                                    </div>
                                                ) : (
                                                    <div className="text-xs text-muted-foreground italic h-6">
                                                        {/* Spacer or customized 'Pendiente' badge if desired */}
                                                    </div>
                                                )}

                                                    <button
                                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-colors ${expanded === sale.id
                                                            ? "bg-primary/10 text-primary"
                                                            : "bg-input text-muted-foreground hover:bg-secondary hover:text-foreground"
                                                            }`}
                                                    >
                                                        {expanded === sale.id ? "Ocultar Detalle" : "Ver Detalle"}
                                                        {expanded === sale.id ? <FaChevronUp /> : <FaChevronDown />}
                                                    </button>

                                            </div>

                                            <div className="md:text-right">
                                                <p className="text-xs text-muted-foreground uppercase font-bold">Total Venta</p>
                                                <p className="text-xl font-bold text-green-500">
                                                    ${sale.total.toFixed(2)}
                                                </p>
                                            </div>


                                        </div>
                                    </div>

                                    {/* Detalle expandible */}
                                    {expanded === sale.id && (
                                        <div className="mt-6 pt-6 border-t border-border animate-slide-down">
                                            <div className="flex justify-between items-center mb-4">
                                                <h3 className="font-bold text-card-foreground flex items-center gap-2">
                                                    <FaShoppingBag className="text-primary" /> Productos Vendidos
                                                </h3>
                                                <div className="flex items-center gap-2">
                                                    {/* Facturar Button - Only if not Invoiced */}
                                                    {!sale.facturaId ? (
                                                        <button
                                                            onClick={() => handleFacturar(sale)}
                                                            disabled={facturandoId === sale.id}
                                                            className={`flex items-center gap-2 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/40 rounded-lg text-sm font-bold transition-colors ${facturandoId === sale.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                        >
                                                            {facturandoId === sale.id ? <FaSpinner className="animate-spin" /> : <FaFileInvoiceDollar />}
                                                            {facturandoId === sale.id ? 'Facturando...' : 'Facturar (AFIP)'}
                                                        </button>
                                                    ) : (
                                                        /* View Invoice Button - Only if Invoiced */
                                                        <button
                                                            onClick={() => router.push(`/facturas/${sale.facturaId}`)}
                                                            className="flex items-center gap-2 px-3 py-1.5 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-lg text-sm font-bold transition-colors"
                                                        >
                                                            <FaFileInvoiceDollar /> Ver Factura
                                                        </button>
                                                    )}

                                                    <button
                                                        onClick={() => handlePrintTicket(sale)}
                                                        disabled={isPrintingTicket}
                                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${isPrintingTicket
                                                            ? "bg-blue-100 text-blue-700 opacity-60 cursor-not-allowed"
                                                            : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                                                            }`}
                                                    >
                                                        <FaPrint /> {isPrintingTicket ? "Abriendo impresión..." : "Imprimir Ticket"}
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(sale.id)}
                                                        className="flex items-center gap-2 px-3 py-1.5 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg text-sm font-bold transition-colors"
                                                        title="Eliminar esta venta"
                                                    >
                                                        <FaTrash /> Eliminar
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="bg-muted/30 rounded-xl border border-border overflow-hidden">
                                                <table className="w-full text-left">
                                                    <thead className="bg-muted/50">
                                                        <tr>
                                                            <th className="p-3 text-xs font-bold text-muted-foreground uppercase">Producto</th>
                                                            <th className="p-3 text-xs font-bold text-muted-foreground uppercase text-center">Cant</th>
                                                            <th className="p-3 text-xs font-bold text-muted-foreground uppercase">Detalle</th>
                                                            <th className="p-3 text-xs font-bold text-muted-foreground uppercase text-right">Precio Unit.</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-border">
                                                        {sale.products.map((p, i) => (
                                                            <tr key={`${sale.id}-p-${i}`}>
                                                                <td className="p-3 text-foreground">{p.title}</td>
                                                                <td className="p-3 text-center text-muted-foreground font-mono">x{p.quantity}</td>
                                                                <td className="p-3 text-muted-foreground text-sm italic">{p.description || "-"}</td>
                                                                <td className="p-3 text-right text-primary font-bold">${p.price.toFixed(2)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* --- Paginación --- */}
                    {!loading && filteredSales.length > 0 && (
                        <Pagination
                            productsPerPage={salesPerPage}
                            totalProducts={filteredSales.length}
                            currentPage={currentPage}
                            paginate={(page) => setCurrentPage(page)}
                        />
                    )}
                </div>
            </div>

            {saleToPrint && (
                <div className="hidden print:block absolute top-0 left-0 w-full bg-white z-9999">
                    <style>{`
                    @media print {
                        nav, header, aside, .sidebar, footer { display: none !important; }
                        main { margin: 0 !important; padding: 0 !important; }
                        html, body { margin: 0 !important; padding: 0 !important; width: 72mm !important; }
                        body * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                        @page { margin: 0; size: 72mm auto; }
                    }
                `}</style>
                    {invoiceToPrint ? (
                        <InvoicedTicketTemplate sale={saleToPrint} invoice={invoiceToPrint} businessData={businessData} />
                    ) : (
                        <TicketTemplate sale={saleToPrint} businessData={businessData} />
                    )}
                </div>
            )}

            {/* Modal de Facturación */}
            {showBillingModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-card w-full max-w-2xl rounded-2xl shadow-xl border border-border flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-border">
                            <h3 className="text-xl font-bold text-card-foreground">Generar Factura{isBulkBilling ? "s" : ""} AFIP</h3>
                            <p className="text-muted-foreground text-sm mt-1">Seleccione el tipo de comprobante y destinatario.</p>
                        </div>

                        <div className="p-6 space-y-6 overflow-y-auto">
                            <div className="bg-muted/30 p-4 rounded-xl border border-border">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center justify-between">
                                    Productos a Facturar
                                    <span className="text-primary normal-case">Total: {formatArs(billingTotal)}</span>
                                </h4>
                                <div className="space-y-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                                    {selectedSales.flatMap((sale) => 
                                        (sale.products || []).map((p, pIdx) => {
                                            const key = `${sale.id}-${pIdx}`;
                                            return (
                                                <div key={key} className="flex flex-col gap-2 p-3 bg-card rounded-lg border border-border/50 text-sm">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                                            <input
                                                                type="checkbox"
                                                                checked={!excludedProducts.has(key)}
                                                                onChange={() => {
                                                                    const newSet = new Set(excludedProducts);
                                                                    if (newSet.has(key)) newSet.delete(key);
                                                                    else newSet.add(key);
                                                                    setExcludedProducts(newSet);
                                                                }}
                                                                className="w-4 h-4 text-primary rounded border-input focus:ring-primary h-4 w-4"
                                                            />
                                                            <div className="truncate flex-1">
                                                                <p className="font-medium truncate">{p.title}</p>
                                                                {isBulkBilling && (
                                                                    <p className="text-[10px] text-muted-foreground">Venta: {sale.id.slice(-6)}</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-muted-foreground text-xs whitespace-nowrap">x{p.quantity}</span>
                                                            <span className="font-bold text-primary">{formatArs(Number(p.price) * (Number(p.quantity) || 1))}</span>
                                                        </div>
                                                    </div>

                                                    {!excludedProducts.has(key) && (
                                                        <div className="flex items-center gap-2 pl-7">
                                                            <span className="text-[10px] text-muted-foreground uppercase font-bold">IVA:</span>
                                                            <select
                                                                className="bg-muted text-[11px] border border-border rounded px-1 py-0.5 outline-none focus:border-primary"
                                                                value={itemIvaOverrides[key]?.ivaId || (p as any).ivaId || billingData.ivaId}
                                                                onChange={(e) => {
                                                                    const selected = IVA_OPTIONS.find(opt => opt.id === Number(e.target.value));
                                                                    if (selected) {
                                                                        setItemIvaOverrides(prev => ({
                                                                            ...prev,
                                                                            [key]: { ivaId: selected.id, ivaRate: selected.rate }
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
                                        })
                                    )}
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

                            {filteredSelectedProducts.length <= 1 && (
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

                            {billingData.cbteTipo === 1 && (
                                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg text-sm text-blue-600 dark:text-blue-400">
                                    ℹ️ Para Factura A es obligatorio ingresar DNI o CUIT.
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border border-border rounded-2xl p-4 bg-muted/10">
                                <div className="md:col-span-2">
                                    <h4 className="text-sm font-bold uppercase tracking-wide text-foreground mb-2">Datos del Receptor</h4>
                                </div>
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
                                                                cbteTipo: isRI ? 1 : prev.cbteTipo,
                                                                nombre: persona.name || prev.nombre,
                                                                email: persona.email || prev.email
                                                            }));
                                                            showAlert("Contribuyente", persona.name, "success");
                                                        } else {
                                                            showAlert("Atención", result.error || "No se encontró el CUIT", "warning");
                                                        }
                                                    } catch (err) {
                                                        showAlert("Error", "Error al consultar padrón", "error");
                                                    } finally {
                                                        setLoading(false);
                                                    }
                                                }}
                                                className="px-4 py-2 bg-primary text-primary-foreground hover:opacity-90 rounded-xl font-bold text-xs"
                                            >
                                                BUSCAR
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium mb-2">Nombre / Razón Social</label>
                                    <input
                                        type="text"
                                        className="w-full p-3 rounded-xl bg-input border border-input outline-none focus:border-primary"
                                        placeholder="Nombre completo o Razón Social"
                                        value={billingData.nombre}
                                        onChange={(e) => setBillingData({ ...billingData, nombre: e.target.value })}
                                    />
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium mb-2">Email (Opcional)</label>
                                    <input
                                        type="email"
                                        className="w-full p-3 rounded-xl bg-input border border-input outline-none focus:border-primary"
                                        placeholder="email@ejemplo.com"
                                        value={billingData.email}
                                        onChange={(e) => setBillingData({ ...billingData, email: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t border-border flex justify-end gap-3 bg-muted/20 rounded-b-2xl">
                            <button
                                onClick={() => setShowBillingModal(false)}
                                className="px-4 py-2 hover:bg-accent hover:text-accent-foreground rounded-lg transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmFacturar}
                                className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg shadow-sm font-medium"
                            >
                                Emitir Factura{isBulkBilling ? "s" : ""}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <CustomAlert
                isOpen={alertProps.isOpen}
                title={alertProps.title}
                message={alertProps.message}
                type={alertProps.type}
                showCancel={alertProps.showCancel}
                confirmText={alertProps.confirmText}
                onConfirm={alertProps.onConfirm}
                onCancel={alertProps.onCancel}
            />
        </>
    );
}
