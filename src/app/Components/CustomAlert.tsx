import React, { useEffect, useRef } from "react";
import { FaCheckCircle, FaExclamationTriangle, FaInfoCircle, FaTimesCircle } from "react-icons/fa";

export type AlertType = "info" | "success" | "warning" | "error";

interface CustomAlertProps {
    isOpen: boolean;
    title: string;
    message: string;
    type?: AlertType;
    showCancel?: boolean;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel?: () => void;
}

const CustomAlert: React.FC<CustomAlertProps> = ({
    isOpen,
    title,
    message,
    type = "info",
    showCancel = false,
    confirmText = "Aceptar",
    cancelText = "Cancelar",
    onConfirm,
    onCancel,
}) => {
    const confirmButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (isOpen) {
            // Auto-focus confirm button for accessibility/speed
            setTimeout(() => {
                confirmButtonRef.current?.focus();
            }, 100);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    // Icon configuration
    let Icon = FaInfoCircle;
    let iconColor = "text-primary";
    let buttonColor = "bg-primary hover:bg-primary/90";

    switch (type) {
        case "success":
            Icon = FaCheckCircle;
            iconColor = "text-green-500";
            buttonColor = "bg-green-600 hover:bg-green-500";
            break;
        case "warning":
            Icon = FaExclamationTriangle;
            iconColor = "text-amber-500";
            buttonColor = "bg-amber-600 hover:bg-amber-500";
            break;
        case "error":
            Icon = FaTimesCircle;
            iconColor = "text-destructive";
            buttonColor = "bg-destructive hover:bg-destructive/90";
            break;
    }

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-card border border-border text-card-foreground w-full max-w-sm md:max-w-md rounded-2xl shadow-2xl scale-100 animate-in zoom-in-95 duration-200 overflow-hidden">
                <div className="p-6 md:p-8 flex flex-col items-center text-center">
                    <div className={`mb-4 p-4 rounded-full bg-secondary ${iconColor} bg-opacity-10 text-4xl`}>
                        <Icon />
                    </div>
                    
                    <h3 className="text-xl md:text-2xl font-bold tracking-tight mb-2">{title}</h3>
                    <p className="text-muted-foreground text-base mb-8 max-w-[90%]">{message}</p>

                    <div className="grid grid-cols-2 gap-3 w-full">
                        {showCancel && (
                            <button
                                type="button"
                                onClick={onCancel}
                                className="col-span-1 px-4 py-3 text-sm font-bold bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-xl transition-colors"
                            >
                                {cancelText}
                            </button>
                        )}
                        <button
                            ref={confirmButtonRef}
                            type="button"
                            onClick={onConfirm}
                            className={`${showCancel ? 'col-span-1' : 'col-span-2'} px-4 py-3 text-sm font-bold text-white ${buttonColor} rounded-xl shadow-lg transition-transform active:scale-95`}
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CustomAlert;
