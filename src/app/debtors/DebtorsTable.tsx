"use client";

import { useState } from "react";
import { useTutorial } from "../Context/TutorialContext";
import { db } from "../config/firebase";
import {
    doc,
    updateDoc,
    arrayUnion,
    Timestamp,
    setDoc,
    deleteDoc,
    collection,
} from "firebase/firestore";
import { FaUserPlus, FaChevronDown, FaChevronUp, FaLock, FaLockOpen, FaMoneyBillWave, FaTrash, FaHistory, FaQuestion } from "react-icons/fa";

// ---------------------- TYPES ----------------------
type Product = {
    name: string;
    title?: string;
    price: number;
    quantity: number;
};

type DebtItem = {
    type: "debt" | "payment";
    products?: Product[];
    amount?: number;
    timestamp?: { seconds: number; nanoseconds: number } | null;
};

type Debtor = {
    id: string;
    name: string;
    numero?: string;
    totalAmount: number;
    debts: DebtItem[];
    isClosed?: boolean;
};

// ---------------------- HELPERS ----------------------
const formatSignedCurrency = (value: number) => {
    const abs = Math.abs(value).toFixed(2);
    return value < 0 ? `-$${abs}` : `$${abs}`;
};

const formatDate = (ts?: { seconds: number; nanoseconds: number } | null) => {
    if (!ts) return "-";
    const date = new Date(ts.seconds * 1000);
    return date.toLocaleString("es-AR");
};

// ---------------------- COMPONENT ----------------------
export default function DebtorsTable({
    initialDebtors,
}: {
    initialDebtors: Debtor[];
}) {
    const { startTutorial } = useTutorial();
    const [debtors, setDebtors] = useState<Debtor[]>(initialDebtors);
    const [expandedDebtor, setExpandedDebtor] = useState<string | null>(null);
    const [editingDebtorId, setEditingDebtorId] = useState<string | null>(null);
    const [paymentAmount, setPaymentAmount] = useState<number>(0);

    // Form para nuevo deudor
    const [showAddForm, setShowAddForm] = useState(false);
    const [newDebtorName, setNewDebtorName] = useState<string>("");
    const [newDebtorNumero, setNewDebtorNumero] = useState<string>("");

    // Estado para confirmación de borrado
    const [confirmDelete, setConfirmDelete] = useState<{
        type: "debtor" | "debt" | "history";
        debtorId: string;
        debtIndex?: number;
    } | null>(null);

    // ---------------------- ACTIONS ----------------------
    // Toggle Cuenta Cerrada
    const handleToggleAccountStatus = async (debtor: Debtor) => {
        try {
            const newStatus = !debtor.isClosed;
            await updateDoc(doc(db, "debtors", debtor.id), {
                isClosed: newStatus
            });

            setDebtors(prev => prev.map(d =>
                d.id === debtor.id ? { ...d, isClosed: newStatus } : d
            ));
        } catch (err) {
            console.error("Error cambiando estado de cuenta:", err);
        }
    };

    // Eliminar historial completo
    const handleClearHistory = async (debtorId: string) => {
        try {
            await updateDoc(doc(db, "debtors", debtorId), {
                debts: [],
                totalAmount: 0
            });

            setDebtors(prev => prev.map(d =>
                d.id === debtorId ? { ...d, debts: [], totalAmount: 0 } : d
            ));
            setConfirmDelete(null);
        } catch (err) {
            console.error("Error eliminando historial:", err);
        }
    };

    // Registrar pago
    const handleRegisterPayment = async (debtor: Debtor, amount: number) => {
        if (amount <= 0) {
            alert("Monto inválido");
            return;
        }
        try {
            const newTotal = debtor.totalAmount - amount;

            const ref = doc(db, "debtors", debtor.id);
            await updateDoc(ref, {
                totalAmount: newTotal,
                debts: arrayUnion({
                    type: "payment",
                    amount,
                    timestamp: Timestamp.now(),
                }),
            });

            setDebtors((prev) =>
                prev.map((d) =>
                    d.id === debtor.id
                        ? {
                            ...d,
                            totalAmount: newTotal,
                            debts: [
                                ...d.debts,
                                {
                                    type: "payment",
                                    amount,
                                    timestamp: { seconds: Date.now() / 1000, nanoseconds: 0 },
                                },
                            ],
                        }
                        : d
                )
            );

            setEditingDebtorId(null);
            setPaymentAmount(0);
        } catch (error) {
            console.error("Error al registrar pago:", error);
        }
    };

    // Agregar deudor
    const handleAddDebtor = async () => {
        if (!newDebtorName.trim()) return;
        try {
            const ref = doc(collection(db, "debtors"));
            await setDoc(ref, {
                name: newDebtorName,
                numero: newDebtorNumero,
                totalAmount: 0,
                debts: [],
            });

            setDebtors((prev) => [
                ...prev,
                {
                    id: ref.id,
                    name: newDebtorName,
                    numero: newDebtorNumero,
                    totalAmount: 0,
                    debts: [],
                },
            ]);

            // reset form
            setNewDebtorName("");
            setNewDebtorNumero("");
            setShowAddForm(false);
        } catch (err) {
            console.error("Error agregando deudor:", err);
        }
    };

    // Eliminar deudor
    const handleDeleteDebtor = async (id: string) => {
        try {
            await deleteDoc(doc(db, "debtors", id));
            setDebtors((prev) => prev.filter((d) => d.id !== id));
            setConfirmDelete(null);
        } catch (err) {
            console.error("Error eliminando:", err);
        }
    };

    // Eliminar deuda puntual
    const handleDeleteDebt = async (debtorId: string, debtIndex: number) => {
        try {
            const debtor = debtors.find((d) => d.id === debtorId);
            if (!debtor) return;

            const updatedDebts = [...debtor.debts];
            updatedDebts.splice(debtIndex, 1);

            const newTotal = updatedDebts.reduce((sum, d) => {
                if (d.type === "payment") return sum - (d.amount || 0);
                return sum + (d.amount || 0);
            }, 0);

            await updateDoc(doc(db, "debtors", debtorId), {
                debts: updatedDebts,
                totalAmount: newTotal,
            });

            setDebtors((prev) =>
                prev.map((d) =>
                    d.id === debtorId ? { ...d, debts: updatedDebts, totalAmount: newTotal } : d
                )
            );
            setConfirmDelete(null);
        } catch (err) {
            console.error("Error eliminando deuda:", err);
        }
    };

    // ---------------------- RENDER ----------------------
    return (
        <div className="max-w-7xl mx-auto p-4 md:p-8">
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                <div className="flex items-center gap-3">
                    <h1 id="debtors-page-title" className="text-3xl font-bold text-primary tracking-tight">Gestión de Deudores</h1>
                    <button
                        onClick={() => startTutorial('specific')}
                        className="flex items-center gap-2 bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/40 px-3 py-1.5 rounded-lg transition-colors font-medium text-sm shadow-sm"
                        title="Ver ayuda de inventario"
                    >
                        <span>❓</span>
                        <span>Tutorial</span>
                    </button>
                </div>
                <button
                    id="btn-add-debtor"
                    onClick={() => setShowAddForm((prev) => !prev)}
                    className="bg-secondary hover:bg-secondary/80 hover:text-primary border border-border text-secondary-foreground px-6 py-3 rounded-xl font-bold transition-all shadow-lg flex items-center gap-2"
                >
                    <FaUserPlus /> Nuevo Deudor
                </button>
            </div>

            {/* Formulario para agregar deudor */}
            {showAddForm && (
                <div className="mb-8 bg-card border border-border p-6 rounded-2xl shadow-xl animate-slide-up">
                    <h3 className="text-xl font-bold text-card-foreground mb-4">Agregar Nuevo Cliente</h3>
                    <div className="flex flex-col md:flex-row gap-4 mb-6">
                        <div className="flex-1 space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">Nombre</label>
                            <input
                                type="text"
                                value={newDebtorName}
                                onChange={(e) => setNewDebtorName(e.target.value)}
                                placeholder="Ej: Juan Perez"
                                className="w-full p-3 bg-input/50 border border-input rounded-xl text-foreground focus:border-primary outline-none transition-colors"
                            />
                        </div>
                        <div className="flex-1 space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">Teléfono (Opcional)</label>
                            <input
                                type="text"
                                value={newDebtorNumero}
                                onChange={(e) => setNewDebtorNumero(e.target.value)}
                                placeholder="Ej: 1122334455"
                                className="w-full p-3 bg-input/50 border border-input rounded-xl text-foreground focus:border-primary outline-none transition-colors"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3">
                        <button
                            onClick={() => setShowAddForm(false)}
                            className="bg-secondary hover:bg-secondary/80 text-secondary-foreground px-6 py-2.5 rounded-lg font-medium transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleAddDebtor}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2.5 rounded-lg font-bold shadow-lg shadow-primary/20 transition-colors"
                        >
                            Guardar Deudor
                        </button>
                    </div>
                </div>
            )}

            {/* Lista de deudores */}
            <div id="debtors-list-container" className="space-y-4">
                {debtors.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                        <p className="text-xl">No hay deudores registrados.</p>
                    </div>
                ) : (
                    debtors.map((debtor, i) => (
                        <div
                            key={debtor.id}
                            id={i === 0 ? "first-debtor-card" : undefined}
                            className="bg-card border border-border rounded-2xl overflow-hidden shadow-lg hover:border-primary/50 transition-colors"
                        >
                            {/* CABECERA (Card Principal) */}
                            <div
                                onClick={() => setExpandedDebtor(expandedDebtor === debtor.id ? null : debtor.id)}
                                className="cursor-pointer p-6 flex flex-col md:flex-row items-center gap-6 md:gap-4 relative"
                            >
                                <div className="absolute right-6 top-6 md:hidden text-muted-foreground">
                                    {expandedDebtor === debtor.id ? <FaChevronUp /> : <FaChevronDown />}
                                </div>

                                {/* Info Principal */}
                                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
                                    <div>
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Cliente</p>
                                        <p className="text-lg font-bold text-card-foreground">{debtor.name}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Contacto</p>
                                        <p className="text-muted-foreground">{debtor.numero || "—"}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Deuda Total</p>
                                        <p className={`text-xl font-bold ${debtor.totalAmount > 0 ? "text-primary" : "text-green-500"}`}>
                                            {formatSignedCurrency(debtor.totalAmount)}
                                        </p>
                                    </div>
                                </div>

                                {/* Acciones */}
                                <div className="flex flex-wrap gap-2 justify-end items-center mt-4 md:mt-0 w-full md:w-auto">
                                    <button
                                        id={i === 0 ? "first-debtor-toggle-status" : undefined}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleToggleAccountStatus(debtor);
                                        }}
                                        className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${debtor.isClosed
                                            ? "bg-secondary text-muted-foreground hover:bg-secondary/80"
                                            : "bg-blue-500/10 text-blue-500 border border-blue-500/30 hover:bg-blue-500/20"
                                            }`}
                                    >
                                        {debtor.isClosed ? <><FaLock size={12} /> Cerrada</> : <><FaLockOpen size={12} /> Abierta</>}
                                    </button>

                                    <button
                                        id={i === 0 ? "first-debtor-pay-btn" : undefined}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingDebtorId(debtor.id);
                                        }}
                                        disabled={debtor.isClosed}
                                        className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${debtor.isClosed
                                            ? "bg-secondary text-muted-foreground cursor-not-allowed"
                                            : "bg-green-500/10 text-green-500 border border-green-500/30 hover:bg-green-500/20"
                                            }`}
                                    >
                                        <FaMoneyBillWave size={14} /> Pagar
                                    </button>

                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setConfirmDelete({ type: "debtor", debtorId: debtor.id });
                                        }}
                                        className="p-2.5 rounded-lg bg-secondary text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors ml-2"
                                        title="Eliminar Cliente"
                                    >
                                        <FaTrash size={14} />
                                    </button>

                                    <div className="hidden md:block ml-2 text-muted-foreground">
                                        {expandedDebtor === debtor.id ? <FaChevronUp /> : <FaChevronDown />}
                                    </div>
                                </div>
                            </div>

                            {/* DETALLE EXPANDIBLE (Historial) */}
                            {expandedDebtor === debtor.id && (
                                <div className="border-t border-border bg-muted/30 p-6 animate-fade-in">
                                    <div className="flex justify-between items-center mb-4">
                                        <h4 className="font-bold text-muted-foreground flex items-center gap-2">
                                            <FaHistory className="text-primary" /> Historial de Movimientos
                                        </h4>
                                        <button
                                            onClick={() => setConfirmDelete({ type: "history", debtorId: debtor.id })}
                                            className="text-xs font-bold text-destructive hover:text-destructive-foreground hover:bg-destructive px-3 py-1.5 rounded-md transition-all"
                                        >
                                            Limpiar Historial
                                        </button>
                                    </div>

                                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                        {debtor.debts.length === 0 ? (
                                            <p className="text-muted-foreground text-sm italic">No hay movimientos registrados.</p>
                                        ) : (
                                            debtor.debts.map((debt, i) => (
                                                <div
                                                    key={i}
                                                    className={`flex flex-col p-3 rounded-lg border ${debt.type === "payment"
                                                        ? "bg-green-500/10 border-green-500/30"
                                                        : "bg-secondary/50 border-border"
                                                        }`}
                                                >
                                                    <div className="flex flex-col md:flex-row md:items-center justify-between w-full">
                                                        <div className="flex items-center gap-4">
                                                            <span className={`text-xs font-bold px-2 py-1 rounded uppercase ${debt.type === "payment" ? "bg-green-500/20 text-green-500" : "bg-primary/20 text-primary"
                                                                }`}>
                                                                {debt.type === "payment" ? "Pago" : "Deuda"}
                                                            </span>
                                                            <span className="text-muted-foreground text-sm">{formatDate(debt.timestamp)}</span>
                                                        </div>

                                                        <div className="flex items-center gap-6 mt-2 md:mt-0 justify-between md:justify-end">
                                                            <span className={`font-mono font-bold ${debt.type === "payment" ? "text-green-500" : "text-foreground"
                                                                }`}>
                                                                {debt.amount ? formatSignedCurrency(debt.amount) : "-"}
                                                            </span>

                                                            <button
                                                                onClick={() =>
                                                                    setConfirmDelete({
                                                                        type: "debt",
                                                                        debtorId: debtor.id,
                                                                        debtIndex: i,
                                                                    })
                                                                }
                                                                className="text-muted-foreground hover:text-destructive transition-colors p-1"
                                                                title="Eliminar registro"
                                                            >
                                                                <FaTrash size={12} />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Product Details */}
                                                    {debt.products && debt.products.length > 0 && (
                                                        <div className="mt-3 pt-3 border-t border-border/50">
                                                            <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Detalle de la compra:</p>
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                                {debt.products.map((prod, idx) => (
                                                                    <div key={idx} className="flex justify-between items-center text-sm bg-background/50 p-2 rounded">
                                                                        <div className="flex flex-col">
                                                                            <span className="font-medium text-foreground">
                                                                                {prod.name}
                                                                                {prod.title && prod.title !== prod.name ? ` (${prod.title})` : ''}
                                                                            </span>
                                                                            <span className="text-xs text-muted-foreground">x{prod.quantity}</span>
                                                                        </div>
                                                                        <span className="font-mono text-foreground">${(prod.price * prod.quantity).toFixed(2)}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )))}
            </div>

            {/* MODAL CONFIRMACIÓN ELIMINAR */}
            {confirmDelete && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
                    <div className="bg-card border border-border p-8 rounded-2xl w-full max-w-md shadow-2xl animate-scale-up">
                        <h2 className="text-xl font-bold mb-2 text-card-foreground">Atención</h2>
                        <p className="text-muted-foreground mb-6">
                            {confirmDelete.type === "debtor"
                                ? "¿Estás seguro de que querés eliminar este cliente permanentemente?"
                                : confirmDelete.type === "history"
                                    ? "¿Estás seguro de que querés eliminar TODO el historial de este cliente?"
                                    : "¿Estás seguro de que querés eliminar este registro de deuda/pago?"}
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setConfirmDelete(null)}
                                className="flex-1 px-4 py-3 rounded-xl bg-secondary text-secondary-foreground font-bold hover:bg-secondary/80 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => {
                                    if (confirmDelete.type === "debtor") {
                                        handleDeleteDebtor(confirmDelete.debtorId);
                                    } else if (confirmDelete.type === "history") {
                                        handleClearHistory(confirmDelete.debtorId);
                                    } else if (
                                        confirmDelete.type === "debt" &&
                                        confirmDelete.debtIndex !== undefined
                                    ) {
                                        handleDeleteDebt(confirmDelete.debtorId, confirmDelete.debtIndex);
                                    }
                                }}
                                className="flex-1 px-4 py-3 rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold transition-colors shadow-lg shadow-destructive/20"
                            >
                                Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL DE PAGO */}
            {editingDebtorId && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
                    <div className="bg-card border border-border p-8 rounded-2xl w-full max-w-md shadow-2xl animate-scale-up">
                        <h2 className="text-xl font-bold mb-6 text-card-foreground text-center">
                            Registrar Pago
                            <span className="block text-sm text-muted-foreground mt-1 font-normal">
                                Cliente: {debtors.find((d) => d.id === editingDebtorId)?.name}
                            </span>
                        </h2>

                        <div className="mb-6">
                            <label className="text-sm font-medium text-muted-foreground block mb-2">Monto del Pago</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                <input
                                    type="number"
                                    value={paymentAmount}
                                    onChange={(e) => setPaymentAmount(Number(e.target.value))}
                                    className="w-full p-4 pl-8 bg-input/50 border border-input rounded-xl text-foreground text-lg font-bold focus:border-green-500 outline-none transition-colors"
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setEditingDebtorId(null);
                                    setPaymentAmount(0);
                                }}
                                className="flex-1 px-4 py-3 rounded-xl bg-secondary text-secondary-foreground font-bold hover:bg-secondary/80 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() =>
                                    handleRegisterPayment(
                                        debtors.find((d) => d.id === editingDebtorId)!,
                                        paymentAmount
                                    )
                                }
                                className="flex-1 px-4 py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold transition-colors shadow-lg shadow-green-600/20"
                            >
                                Confirmar Pago
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
