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
} from "react-icons/fa";
import { db } from "../config/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export default function FacturacionManual() {
    const { login, user } = useAuthContext();
    const isAdmin = Boolean(user?.isAdmin);
    const searchParams = useSearchParams();
    const prefilledImporte = searchParams.get("importe") || "";

    const [loading, setLoading] = useState(false);
    const [successData, setSuccessData] = useState<{ id?: string; cae?: string; vencimientoCae?: string; nroComprobante?: string; puntoVenta?: string } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        importe: prefilledImporte,
        cbteTipo: "11", // Default C
        docTipo: "99", // 99: Consumidor Final, 96: DNI, 80: CUIT
        docNro: "",
        nombre: "",
        email: ""
    });

    // Update formData when URL params change (optional but good for consistency)
    useEffect(() => {
        if (prefilledImporte) {
            setFormData(prev => ({ ...prev, importe: prefilledImporte }));
        }
    }, [prefilledImporte]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setSuccessData(null);

        // Validacion para A y B
        const tipo = parseInt(formData.cbteTipo);
        if ((tipo === 1 || tipo === 6) && !formData.docNro) {
            setError("Para Factura A o B es obligatorio indicar el número de documento (CUIT/DNI).");
            setLoading(false);
            return;
        }

        try {
            let resultData;

            if (typeof window !== 'undefined' && window.electron?.afip) {
                const resAfip = await window.electron.afip.crearFacturaC({
                    importe: parseFloat(formData.importe),
                    concepto: 1, // Default to Productos
                    docTipo: parseInt(formData.docTipo),
                    docNro: formData.docNro ? parseInt(formData.docNro) : 0,
                    cbteTipo: tipo
                });

                if (!resAfip.success) throw new Error(resAfip.error || "Error desconocido de AFIP");

                const afipData = resAfip.data as { cae: string; vencimientoCae: string; nroComprobante: string; puntoVenta: number };

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
                    items: [], // Manual invoice might not have specific items
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
                        cbteTipo: tipo,
                        docTipo: parseInt(formData.docTipo),
                        docNro: formData.docNro ? parseInt(formData.docNro) : 0,
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
            <div className="max-w-2xl mx-auto">
                <div className="mb-6">
                    <Link href="/facturas" className="text-muted-foreground hover:text-foreground flex items-center gap-2 transition-colors">
                        <FaArrowLeft /> Volver al Historial
                    </Link>
                </div>

                <div className="bg-card rounded-2xl shadow-xl p-8 border border-border">
                    <div className="flex items-center gap-4 mb-8 border-b border-border pb-6">
                        <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center text-primary text-xl">
                            <FaFileInvoiceDollar />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold">Facturación Manual ARCA</h1>
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
                                        href={`/facturas/ver?id=${successData.id}`}
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

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                                    <option value="11">Factura C (Consumidor Final)</option>
                                    <option value="6">Factura B (Resp. Inscripto - Cons Final)</option>
                                    <option value="1">Factura A (Resp. Inscripto - Resp. Inscripto)</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-muted-foreground mb-2">Tipo Documento</label>
                                <select
                                    name="docTipo"
                                    value={formData.docTipo}
                                    onChange={handleChange}
                                    className="w-full p-3 border border-border rounded-xl bg-background focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                                >
                                    <option value="99">Consumidor Final</option>
                                    <option value="96">DNI</option>
                                    <option value="80">CUIT</option>
                                </select>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-muted-foreground mb-2">Número de Documento</label>
                                <input
                                    type="number"
                                    name="docNro"
                                    value={formData.docNro}
                                    onChange={handleChange}
                                    disabled={formData.docTipo === "99"}
                                    className="w-full p-3 border border-border rounded-xl bg-background focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all disabled:bg-muted disabled:text-muted-foreground"
                                    placeholder={formData.docTipo === "99" ? "No requerido" : "Ingrese número"}
                                />
                            </div>
                        </div>

                        <div className="border-t border-border pt-6">
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

                        <div className="pt-4">
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
