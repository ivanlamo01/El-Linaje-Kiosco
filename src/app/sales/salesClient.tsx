"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useTutorial } from "../Context/TutorialContext";
import { getSalesByRange, deleteSale } from "../lib/sales";
import CustomAlert, { AlertType } from "../Components/CustomAlert";
import { Sale as SaleType } from "../types/saleTypes";
import Pagination from "../Components/Pagination";
import TicketTemplate from "../Components/TicketTemplate";
import { FaCalendarAlt, FaSearch, FaChevronDown, FaChevronUp, FaMoneyBillWave, FaCreditCard, FaReceipt, FaShoppingBag, FaPrint, FaFileInvoiceDollar, FaSpinner, FaQuestion, FaTrash } from "react-icons/fa";

interface Props {
    initialSales: SaleType[];
}

export default function SalesClient({ initialSales }: Props) {
    const { startTutorial } = useTutorial();
    const router = useRouter();
    const [sales, setSales] = useState<SaleType[]>(initialSales);
    const [loading, setLoading] = useState(false);
    const [facturandoId, setFacturandoId] = useState<string | null>(null);
    const [totalRange, setTotalRange] = useState(
        initialSales.reduce((acc, s) => acc + s.total, 0)
    );
    const [expanded, setExpanded] = useState<string | null>(null);
    const [saleToPrint, setSaleToPrint] = useState<SaleType | null>(null);

    // --- Billing Modal State ---
    const [showBillingModal, setShowBillingModal] = useState(false);
    const [isBulkBilling, setIsBulkBilling] = useState(false);
    const [billingSale, setBillingSale] = useState<SaleType | null>(null);
    const [billingData, setBillingData] = useState({
        cbteTipo: 11, // Default C
        docTipo: 99,  // Default Consumidor Final
        docNro: "",
    });

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

    const showConfirm = (title: string, message: string, onConfirm: () => void, type: AlertType = "warning", confirmText = "Confirmar") => {
        setAlertProps({
            isOpen: true,
            title,
            message,
            type,
            showCancel: true,
            confirmText,
            onConfirm: () => {
                closeAlert();
                onConfirm();
            },
            onCancel: closeAlert,
        });
    };

    const businessData = {
        name: "GALVAN VALERIA ALDANA",
        cuit: "27- 31391814_4",
        address: process.env.NEXT_PUBLIC_BUSINESS_ADDRESS || "-",
        startActivity: process.env.NEXT_PUBLIC_BUSINESS_START_ACTIVITY || undefined,
        iibb: process.env.NEXT_PUBLIC_BUSINESS_IIBB || undefined,
        condition: process.env.NEXT_PUBLIC_BUSINESS_CONDITION || "Responsable Monotributo"
    };

    const handlePrintTicket = (sale: SaleType) => {
        setSaleToPrint(sale);
        setTimeout(() => {
            window.print();
        }, 300);
    };

    const handleFacturar = async (sale: SaleType) => {
        setBillingSale(sale);
        setIsBulkBilling(false);
        setBillingData({
            cbteTipo: 11,
            docTipo: 99,
            docNro: "",
        });
        setShowBillingModal(true);
    };

    const handleBulkFacturar = async () => {
        if (selectedIds.size === 0) return;
        setIsBulkBilling(true);
        setBillingSale(null);
        setBillingData({
            cbteTipo: 11,
            docTipo: 99,
            docNro: "",
        });
        setShowBillingModal(true);
    };

    const confirmFacturar = async () => {
        // Basic validation
        if ((billingData.cbteTipo === 1 || billingData.cbteTipo === 6) && !billingData.docNro) {
            showAlert("Error", "Para Factura A o B es obligatorio el número de documento (CUIT/DNI).", "error");
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

    const facturarSingle = async (sale: SaleType, silent = false, options = { cbteTipo: 11, docTipo: 99, docNro: 0 as string | number }): Promise<{ success: boolean; id?: string; error?: string }> => {
        if (!silent) setFacturandoId(sale.id);
        try {
            const res = await fetch("/api/afip/facturar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    importe: Number(sale.total),
                    items: sale.products,
                    docTipo: options.docTipo,
                    docNro: Number(options.docNro),
                    cbteTipo: options.cbteTipo,
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
            setTotalRange(prev => {
                const sale = sales.find(s => s.id === saleId);
                return sale ? prev - sale.total : prev;
            });

            if (expanded === saleId) setExpanded(null);
            showAlert("Éxito", "Venta eliminada correctamente.", "success");
        } catch (err: unknown) {
            showAlert("Error", "Error al eliminar venta: " + (err instanceof Error ? err.message : String(err)), "error");
        }
    };

    // --- 🔑 Paginación ---
    const [currentPage, setCurrentPage] = useState(1);
    const salesPerPage = 10; // cantidad de ventas por página

    // Calcular índice de los productos a mostrar
    const indexOfLastSale = currentPage * salesPerPage;
    const indexOfFirstSale = indexOfLastSale - salesPerPage;
    const currentSales = sales.slice(indexOfFirstSale, indexOfLastSale);

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            const allIds = new Set(currentSales.map(s => s.id));
            setSelectedIds(allIds);
        } else {
            setSelectedIds(new Set());
        }
    };

    // Check if all displayed are selected
    const isAllSelected = currentSales.length > 0 && currentSales.every(s => selectedIds.has(s.id));

    const handleFilter = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const startDate = formData.get("start") as string;
        const endDate = formData.get("end") as string;

        if (!startDate || !endDate) return;

        setLoading(true);

        // Parseamos "YYYY-MM-DD" manualmente para asegurar que sea hora LOCAL
        const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
        const start = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);

        const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
        const end = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);

        const filteredSales = await getSalesByRange(start, end);
        setSales(filteredSales);
        setTotalRange(filteredSales.reduce((acc, s) => acc + s.total, 0));
        setCurrentPage(1); // resetear a la primera página

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
                                    <span>❓</span>
                                    <span>Tutorial</span>
                                </button>
                            </div>
                            <p className="text-muted-foreground mt-1">Consulta y filtra los movimientos de venta</p>
                        </div>
                        {/* Total Card Small */}
                        <div id="sales-total-card" className="bg-card border border-border px-6 py-3 rounded-xl flex flex-col items-end shadow-sm">
                            <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Total en Rango</span>
                            <span className="text-2xl font-bold text-green-500">${totalRange.toFixed(2)}</span>
                        </div>
                    </div>

                    {/* --- Filtros --- */}
                    <div id="sales-filter-section" className="bg-card border border-border p-6 rounded-2xl shadow-sm">
                        <h3 className="text-lg font-bold text-card-foreground mb-4 flex items-center gap-2">
                            <FaSearch className="text-muted-foreground" /> Filtrar por Fecha
                        </h3>
                        <form onSubmit={handleFilter} className="flex flex-col md:flex-row gap-4 items-end">
                            <div className="flex-1 w-full">
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

                            <div className="flex-1 w-full">
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

                            <button
                                type="submit"
                                className="w-full md:w-auto bg-primary text-primary-foreground hover:opacity-90 font-bold px-8 py-3 rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                            >
                                <FaSearch /> Aplicar Filtro
                            </button>
                        </form>
                    </div>

                    {/* --- Bulk Actions Bar --- */}
                    {selectedIds.size > 0 && (
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
                    ) : sales.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground border border-dashed border-border rounded-2xl">
                            <FaReceipt className="text-6xl mb-4 text-muted-foreground/50" />
                            <p className="text-xl">No se encontraron ventas</p>
                            <p className="text-sm">Prueba ajustando el rango de fechas</p>
                        </div>
                    ) : (
                        <div id="sales-list-container" className="space-y-4">
                            {/* Select All Row */}
                            {currentSales.length > 0 && (
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
                                    className={`bg-card border rounded-2xl p-6 shadow-sm hover:border-primary/50 transition-all group ${selectedIds.has(sale.id) ? 'border-primary bg-primary/5' : 'border-border'}`}
                                >
                                    {/* Cabecera */}
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center h-full" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.has(sale.id)}
                                                onChange={(e) => handleSelectSale(sale.id, e.target.checked)}
                                                className="w-5 h-5 text-primary rounded focus:ring-primary bg-input border-muted cursor-pointer"
                                            />
                                        </div>

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
                                                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg text-sm font-bold transition-colors"
                                                    >
                                                        <FaPrint /> Imprimir Ticket
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
                    {!loading && sales.length > 0 && (
                        <Pagination
                            productsPerPage={salesPerPage}
                            totalProducts={sales.length}
                            currentPage={currentPage}
                            paginate={(page) => setCurrentPage(page)}
                        />
                    )}
                </div>
            </div>

            {saleToPrint && (
                <div className="hidden print:block absolute top-0 left-0 w-full bg-white z-[9999]">
                    <style>{`
                    @media print {
                        nav, header, aside, .sidebar, footer { display: none !important; }
                        main { margin: 0 !important; padding: 0 !important; }
                        @page { margin: 0; size: auto; }
                    }
                `}</style>
                    <TicketTemplate sale={saleToPrint} businessData={businessData} />
                </div>
            )}

            {/* Modal de Facturación */}
            {showBillingModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-card w-full max-w-md rounded-2xl shadow-xl border border-border flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-border">
                            <h3 className="text-xl font-bold text-card-foreground">Generar Factura{isBulkBilling ? "s" : ""} AFIP</h3>
                            <p className="text-muted-foreground text-sm mt-1">Seleccione el tipo de comprobante y destinatario.</p>
                        </div>

                        <div className="p-6 space-y-4 overflow-y-auto">
                            <div>
                                <label className="block text-sm font-medium mb-2">Tipo de Factura</label>
                                <select
                                    className="w-full p-3 rounded-xl bg-input border border-input outline-none focus:border-primary"
                                    value={billingData.cbteTipo}
                                    onChange={(e) => setBillingData({ ...billingData, cbteTipo: Number(e.target.value) })}
                                >
                                    <option value={11}>Factura C (Consumidor Final)</option>
                                    <option value={6}>Factura B (Resp. Inscripto a Cons. Final/Exento)</option>
                                    <option value={1}>Factura A (Resp. Inscripto a Resp. Inscripto)</option>
                                </select>
                            </div>

                            {billingData.cbteTipo !== 11 && (
                                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg text-sm text-blue-600 dark:text-blue-400">
                                    ℹ️ Para Factura A o B es obligatorio ingresar DNI o CUIT.
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium mb-2">Tipo de Documento</label>
                                <select
                                    className="w-full p-3 rounded-xl bg-input border border-input outline-none focus:border-primary"
                                    value={billingData.docTipo}
                                    onChange={(e) => setBillingData({ ...billingData, docTipo: Number(e.target.value) })}
                                >
                                    <option value={99}>Sin Identificar (Solo Factura C &lt; Límite)</option>
                                    <option value={96}>DNI (96)</option>
                                    <option value={80}>CUIT (80)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-2">Número de Documento</label>
                                <input
                                    type="number"
                                    className="w-full p-3 rounded-xl bg-input border border-input outline-none focus:border-primary"
                                    placeholder="Ingrese DNI o CUIT sin guiones"
                                    value={billingData.docNro}
                                    onChange={(e) => setBillingData({ ...billingData, docNro: e.target.value })}
                                />
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
