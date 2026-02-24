import React, { useState, useEffect, useRef } from "react";

interface ModalInputProps {
    isOpen: boolean;
    title: string;
    message?: string;
    defaultValue?: string;
    placeholder?: string;
    type?: "text" | "number";
    onConfirm: (value: string) => void;
    onCancel: () => void;
}

const ModalInput: React.FC<ModalInputProps> = ({
    isOpen,
    title,
    message,
    defaultValue = "",
    placeholder = "",
    type = "text",
    onConfirm,
    onCancel,
}) => {
    const [value, setValue] = useState(defaultValue);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setValue(defaultValue);
            setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            }, 100);
        }
    }, [isOpen, defaultValue]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onConfirm(value);
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-card border border-border text-card-foreground w-full max-w-md rounded-xl shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
                <div className="p-6 space-y-4">
                    <h3 className="text-xl font-bold tracking-tight">{title}</h3>
                    {message && <p className="text-muted-foreground text-sm">{message}</p>}

                    <form onSubmit={handleSubmit}>
                        <input
                            ref={inputRef}
                            type={type}
                            className="w-full px-4 py-3 bg-input border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-lg"
                            placeholder={placeholder}
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                        />

                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                type="button"
                                onClick={onCancel}
                                className="px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground rounded-lg transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                className="px-4 py-2 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg shadow-md transition-all active:scale-95"
                            >
                                Aceptar
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default ModalInput;
