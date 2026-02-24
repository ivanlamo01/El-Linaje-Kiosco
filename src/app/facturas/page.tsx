"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { collection, query, orderBy, limit, getDocs, addDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/app/config/firebase";
import { useAuthContext } from "../Context/AuthContext";
import { formatCurrency } from "@/app/lib/utils/afipHelpers";
import { FaFileInvoice, FaEye, FaArrowLeft, FaBan, FaExclamationTriangle } from "react-icons/fa";

interface Invoice {
    id: string;
    createdAt: { seconds: number };
    nroComprobante: number;
    puntoVenta: number;
    docNro: number;
    docTipo?: number;
    importe: number;
    concepto?: number;
    nombre?: string;
    tipo?: string;
    tipoComprobante?: number;
    status?: string;
    cae?: string;
}

export default function FacturasList() {
    const { login, user } = useAuthContext();
    const isAdmin = Boolean(user?.isAdmin);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);

    useEffect(() => {
        if (isAdmin) {
            fetchInvoices();
        }
    }, [isAdmin]);

    const fetchInvoices = async () => {
        try {
            const q = query(collection(db, "facturas"), orderBy("createdAt", "desc"), limit(50));
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Invoice[];
            setInvoices(data);
        } catch (error) {
            console.error("Error fetching invoices:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleAnular = async (invoice: Invoice) => {
        if (!confirm(`¿Estás seguro de que querés ANULAR la factura ${invoice.nroComprobante}? Esto generará una Nota de Crédito en AFIP.`)) {
            return;
        }

        setProcessingId(invoice.id);
        try {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment

            if (typeof window !== 'undefined' && window.electron && window.electron.afip) {
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-expect-error
                const result = await window.electron.afip.crearNotaCreditoC({
                    importe: invoice.importe,
                    concepto: invoice.concepto,
                    docNro: invoice.docNro,
                    docTipo: invoice.docTipo,
                    voucherAsociado: invoice.nroComprobante
                });

                if (!result.success) throw new Error(result.error);

                const ncData = result.data;

                // 1. Update original invoice status
                const invoiceRef = doc(db, "facturas", invoice.id);
                await updateDoc(invoiceRef, { status: "anulada" });

                // 2. Save Credit Note
                await addDoc(collection(db, "facturas"), {
                    ...ncData,
                    importe: invoice.importe,
                    concepto: invoice.concepto,
                    docNro: invoice.docNro,
                    docTipo: invoice.docTipo,
                    nombre: invoice.nombre || null,
                    tipo: 'NC',
                    relatedInvoiceId: invoice.id,
                    createdAt: serverTimestamp(),
                    manual: true
                });

                alert(`Factura anulada con éxito. Nota de Crédito generada: ${ncData.nroComprobante}`);

            } else {
                const res = await fetch("/api/afip/nota-credito", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        facturaId: invoice.id,
                        importe: invoice.importe,
                        concepto: invoice.concepto,
                        docNro: invoice.docNro,
                        docTipo: invoice.docTipo,
                        nroComprobanteOriginal: invoice.nroComprobante
                    })
                });

                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.error || "Error al anular factura");
                }

                alert(`Factura anulada con éxito. Nota de Crédito generada: ${data.data.nroComprobante}`);
            }

            fetchInvoices(); // Refresh list

        } catch (error: unknown) {
            console.error("Error anulando factura:", error);
            alert((error as Error).message);
        } finally {
            setProcessingId(null);
        }
    };

    if (!login) {
        return (
            <div className="flex h-screen items-center justify-center bg-background p-6">
                <div className="text-center bg-card border border-border p-8 rounded-2xl max-w-md w-full shadow-2xl">
                    <FaExclamationTriangle className="text-5xl text-muted-foreground mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-foreground mb-2">Acceso Restringido</h2>
                    <p className="text-muted-foreground">Debes iniciar sesión para ver las facturas.</p>
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
                    <p className="text-muted-foreground">No tienes permisos para acceder al historial.</p>
                </div>
            </div>
        );
    }

    const getCbteLabel = (tipo: string | undefined, codigo: number | undefined) => {
        if (tipo === 'NC') return 'NC';
        switch(codigo) {
            case 1: return 'FC-A';
            case 6: return 'FC-B';
            case 11: return 'FC-C';
            case 3: return 'NC-A';
            case 8: return 'NC-B';
            case 13: return 'NC-C';
            default: return `FC-${codigo}`; 
        }
    };

    return (
        <div className="min-h-screen bg-background text-foreground p-6 lg:p-8">
            <div className="max-w-6xl mx-auto">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-4">
                    <div>
                        <Link href="/" className="text-muted-foreground hover:text-foreground flex items-center gap-2 transition-colors mb-2">
                            <FaArrowLeft /> Volver al Inicio
                        </Link>
                        <h1 className="text-3xl font-bold">Historial de Facturas</h1>
                        <p className="text-muted-foreground">Últimos comprobantes generados manualmente</p>
                    </div>
                    <Link
                        href="/facturacion"
                        className="bg-primary text-primary-foreground px-6 py-3 rounded-xl font-bold shadow-lg transition-all flex items-center gap-2 hover:opacity-90"
                    >
                        <FaFileInvoice />
                        Nueva Factura
                    </Link>
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block bg-card rounded-2xl shadow-lg overflow-hidden border border-border">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-muted border-b border-border">
                                <tr>
                                    <th className="p-4 font-bold text-muted-foreground">Fecha</th>
                                    <th className="p-4 font-bold text-muted-foreground">Comprobante</th>
                                    <th className="p-4 font-bold text-muted-foreground">Cliente</th>
                                    <th className="p-4 font-bold text-muted-foreground text-right">Importe</th>
                                    <th className="p-4 font-bold text-muted-foreground text-center">CAE</th>
                                    <th className="p-4 font-bold text-muted-foreground text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {loading ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-muted-foreground">Cargando facturas...</td>
                                    </tr>
                                ) : invoices.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-muted-foreground">No hay facturas registradas aún.</td>
                                    </tr>
                                ) : (
                                    invoices.map((inv) => (
                                        <tr key={inv.id} className={`hover:bg-muted/60 transition-colors ${inv.status === 'anulada' ? 'bg-destructive/10 opacity-75' : ''}`}>
                                            <td className="p-4 text-muted-foreground">
                                                {inv.createdAt?.seconds ? new Date(inv.createdAt.seconds * 1000).toLocaleDateString() : '-'}
                                            </td>
                                            <td className="p-4 font-mono text-primary font-bold">
                                                {getCbteLabel(inv.tipo, inv.tipoComprobante)} {String(inv.puntoVenta).padStart(4, '0')}-{String(inv.nroComprobante).padStart(8, '0')}
                                                {inv.status === 'anulada' && <span className="ml-2 text-xs bg-destructive/20 text-destructive px-2 py-0.5 rounded-full">ANULADA</span>}
                                            </td>
                                            <td className="p-4 text-foreground">
                                                {inv.nombre || 'Consumidor Final'}
                                                {inv.docNro > 0 && <span className="text-xs text-muted-foreground block">Doc: {inv.docNro}</span>}
                                            </td>
                                            <td className="p-4 text-right font-bold text-foreground">
                                                {inv.tipo === 'NC' ? '-' : ''}{formatCurrency(inv.importe)}
                                            </td>
                                            <td className="p-4 text-center font-mono text-xs text-muted-foreground">
                                                {inv.cae}
                                            </td>
                                            <td className="p-4 text-center flex justify-center gap-2">
                                                <Link
                                                    href={`/facturas/${inv.id}`}
                                                    className="text-primary hover:text-primary/80 p-2 transition-colors"
                                                    title="Ver Factura"
                                                >
                                                    <FaEye />
                                                </Link>
                                                {inv.status !== 'anulada' && inv.tipo !== 'NC' && (
                                                    <button
                                                        onClick={() => handleAnular(inv)}
                                                        disabled={processingId === inv.id}
                                                        className="text-destructive hover:opacity-80 p-2 transition-colors disabled:opacity-50"
                                                        title="Anular Factura (Generar Nota de Crédito)"
                                                    >
                                                        <FaBan className={processingId === inv.id ? "animate-spin" : ""} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-4">
                    {loading ? (
                        <div className="text-center p-8 text-muted-foreground">Cargando facturas...</div>
                    ) : invoices.length === 0 ? (
                        <div className="text-center p-8 text-muted-foreground">No hay facturas registradas aún.</div>
                    ) : (
                        invoices.map((inv) => (
                            <div key={inv.id} className={`bg-card p-5 rounded-2xl shadow-sm border border-border flex flex-col gap-3 ${inv.status === 'anulada' ? 'bg-destructive/5' : ''}`}>
                                <div className="flex justify-between items-start">
                                    <div className="flex flex-col">
                                        <span className={`font-mono font-bold text-sm ${inv.status === 'anulada' ? 'text-destructive decoration-line-through' : 'text-primary'}`}>
                                            {getCbteLabel(inv.tipo, inv.tipoComprobante)} {String(inv.puntoVenta).padStart(4, '0')}-{String(inv.nroComprobante).padStart(8, '0')}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {inv.createdAt?.seconds ? new Date(inv.createdAt.seconds * 1000).toLocaleDateString() : '-'}
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        <span className="block text-xl font-bold text-foreground">
                                            {inv.tipo === 'NC' ? '-' : ''}{formatCurrency(inv.importe)}
                                        </span>
                                        {inv.status === 'anulada' && <span className="text-xs font-bold text-destructive">ANULADA</span>}
                                    </div>
                                </div>

                                <div className="text-sm border-t border-border pt-3">
                                    <p className="text-foreground font-medium truncate">{inv.nombre || 'Consumidor Final'}</p>
                                    {inv.docNro > 0 && <p className="text-muted-foreground text-xs">Doc: {inv.docNro}</p>}
                                    {inv.cae && <p className="text-muted-foreground text-xs font-mono mt-1">CAE: {inv.cae}</p>}
                                </div>

                                <div className="grid grid-cols-2 gap-3 pt-2">
                                    <Link
                                        href={`/facturas/${inv.id}`}
                                        className="flex items-center justify-center gap-2 py-2 bg-secondary text-secondary-foreground rounded-lg text-sm font-bold hover:bg-secondary/80 transition-colors"
                                    >
                                        <FaEye /> Ver
                                    </Link>
                                    {inv.status !== 'anulada' && inv.tipo !== 'NC' && (
                                        <button
                                            onClick={() => handleAnular(inv)}
                                            disabled={processingId === inv.id}
                                            className="flex items-center justify-center gap-2 py-2 bg-destructive/10 text-destructive rounded-lg text-sm font-bold hover:bg-destructive/20 transition-colors disabled:opacity-50"
                                        >
                                            <FaBan className={processingId === inv.id ? "animate-spin" : ""} /> Anular
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
