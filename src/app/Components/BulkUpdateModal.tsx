import React, { useState } from "react";

export type BulkActionType = "price" | "stock" | "category" | "delete";

export interface BulkActionPayload {
    type: BulkActionType;
    value: number | string; // price/stock/categoryId
    operation?: "set" | "add" | "subtract"; // for stock
}

interface BulkUpdateModalProps {
    count: number;
    categories: Record<string, string>;
    onClose: () => void;
    onConfirm: (payload: BulkActionPayload) => Promise<void>;
}

const BulkUpdateModal: React.FC<BulkUpdateModalProps> = ({ count, categories, onClose, onConfirm }) => {
    const [actionType, setActionType] = useState<BulkActionType>("price");
    const [price, setPrice] = useState<number | "">("");
    const [stock, setStock] = useState<number | "">("");
    const [stockOperation, setStockOperation] = useState<"set" | "add" | "subtract">("set");
    const [categoryId, setCategoryId] = useState<string>("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const payload: BulkActionPayload = {
            type: actionType,
            value: 0,
        };

        if (actionType === "price") {
            if (price === "" || price < 0) { setLoading(false); return; }
            payload.value = Number(price);
        } else if (actionType === "stock") {
            if (stock === "" || stock < 0) { setLoading(false); return; }
            payload.value = Number(stock);
            payload.operation = stockOperation;
        } else if (actionType === "category") {
            if (!categoryId) { setLoading(false); return; }
            payload.value = categoryId;
        } else if (actionType === "delete") {
            // No value needed
        }

        await onConfirm(payload);
        setLoading(false);
        onClose();
    };

    const tabs: { id: BulkActionType; label: string; icon: string }[] = [
        { id: "price", label: "Precio", icon: "💰" },
        { id: "stock", label: "Stock", icon: "📦" },
        { id: "category", label: "Categoría", icon: "📂" },
        { id: "delete", label: "Eliminar", icon: "🗑️" },
    ];

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4 animate-fade-in">
            <div className="bg-card border border-border p-6 rounded-2xl shadow-xl w-full max-w-lg space-y-6 animate-slide-up">

                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-foreground">
                        Gestión Masiva <span className="text-primary text-lg">({count})</span>
                    </h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
                </div>

                {/* Tabs */}
                <div className="flex p-1 bg-muted rounded-xl gap-1">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActionType(tab.id)}
                            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2
                                ${actionType === tab.id
                                    ? "bg-card text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground hover:bg-black/5"
                                }
                                ${tab.id === "delete" && actionType === "delete" ? "!bg-red-500/10 !text-red-500" : ""}
                            `}
                        >
                            <span>{tab.icon}</span>
                            <span className="hidden sm:inline">{tab.label}</span>
                        </button>
                    ))}
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">

                    {/* --- PRICE --- */}
                    {actionType === "price" && (
                        <div className="space-y-3">
                            <label className="text-sm font-medium text-muted-foreground">Nuevo Precio para la selección</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                <input
                                    type="number"
                                    placeholder="0.00"
                                    className="w-full p-4 pl-8 bg-input border border-border rounded-xl focus:ring-2 focus:ring-primary outline-none text-foreground text-lg font-bold"
                                    value={price === 0 ? "" : price}
                                    onChange={(e) => setPrice(e.target.value === "" ? "" : Number(e.target.value))}
                                    onFocus={(e) => e.target.select()}
                                    required
                                    min="0"
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">Se sobrescribirá el precio actual de todos los productos seleccionados.</p>
                        </div>
                    )}

                    {/* --- STOCK --- */}
                    {actionType === "stock" && (
                        <div className="space-y-3">
                            <div className="flex gap-2 mb-2">
                                {(["set", "add", "subtract"] as const).map(op => (
                                    <button
                                        key={op}
                                        type="button"
                                        onClick={() => setStockOperation(op)}
                                        className={`px-3 py-1 text-xs font-bold rounded-lg border ${stockOperation === op
                                                ? "bg-primary text-primary-foreground border-primary"
                                                : "bg-input text-muted-foreground border-border"
                                            }`}
                                    >
                                        {op === "set" ? "Establecer" : op === "add" ? "Sumar" : "Restar"}
                                    </button>
                                ))}
                            </div>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">#</span>
                                <input
                                    type="number"
                                    placeholder="Cant."
                                    className="w-full p-4 pl-8 bg-input border border-border rounded-xl focus:ring-2 focus:ring-primary outline-none text-foreground text-lg font-bold"
                                    value={stock === 0 ? "" : stock}
                                    onChange={(e) => setStock(e.target.value === "" ? "" : Number(e.target.value))}
                                    onFocus={(e) => e.target.select()}
                                    required
                                    min="0"
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {stockOperation === "set" && "Todos los productos tendrán este stock exacto."}
                                {stockOperation === "add" && "Se sumará esta cantidad al stock actual de cada producto."}
                                {stockOperation === "subtract" && "Se restará esta cantidad (el stock no bajará de 0)."}
                            </p>
                        </div>
                    )}

                    {/* --- CATEGORY --- */}
                    {actionType === "category" && (
                        <div className="space-y-3">
                            <label className="text-sm font-medium text-muted-foreground">Mover a Categoría</label>
                            <select
                                className="w-full p-4 bg-input border border-border rounded-xl focus:ring-2 focus:ring-primary outline-none text-foreground text-lg"
                                value={categoryId}
                                onChange={(e) => setCategoryId(e.target.value)}
                                required
                            >
                                <option value="">Seleccionar...</option>
                                {Object.entries(categories).map(([id, name]) => (
                                    <option key={id} value={id}>{name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* --- DELETE --- */}
                    {actionType === "delete" && (
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl space-y-2">
                            <h3 className="text-red-500 font-bold flex items-center gap-2">⚠️ ¡Zona de Peligro!</h3>
                            <p className="text-sm text-red-500/80">
                                Estás a punto de eliminar permanentemente <span className="font-bold">{count}</span> productos.
                                Esta acción <span className="underline">no se puede deshacer</span>.
                            </p>
                        </div>
                    )}

                    <div className="flex gap-3 pt-4 border-t border-border">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 bg-secondary hover:bg-secondary/80 text-secondary-foreground py-3 rounded-xl font-bold transition-colors"
                            disabled={loading}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className={`flex-1 py-3 rounded-xl font-bold transition-colors shadow-md disabled:opacity-50
                                ${actionType === "delete"
                                    ? "bg-red-500 hover:bg-red-600 text-white shadow-red-500/20"
                                    : "bg-primary hover:opacity-90 text-primary-foreground"
                                }
                            `}
                            disabled={loading}
                        >
                            {loading ? "Procesando..." : actionType === "delete" ? "Eliminar Todo" : "Confirmar"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default BulkUpdateModal;
