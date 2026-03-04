import React, { useState, useCallback } from 'react';
import CustomAlert, { AlertType } from '../app/Components/CustomAlert';

export function useCustomAlert() {
    const [isOpen, setIsOpen] = useState(false);
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [type, setType] = useState<AlertType>('info');
    const [showCancel, setShowCancel] = useState(false);
    const [confirmText, setConfirmText] = useState('Aceptar');
    const [cancelText, setCancelText] = useState('Cancelar');
    const [onConfirmCallback, setOnConfirmCallback] = useState<(() => void) | null>(null);

    const closeAlert = useCallback(() => {
        setIsOpen(false);
    }, []);

    const handleConfirm = useCallback(() => {
        setIsOpen(false);
        if (onConfirmCallback) {
            onConfirmCallback();
        }
    }, [onConfirmCallback]);

    const showAlert = useCallback((title: string, message: string, type: AlertType = 'info') => {
        setTitle(title);
        setMessage(message);
        setType(type);
        setShowCancel(false);
        setConfirmText('Aceptar');
        setOnConfirmCallback(null);
        setIsOpen(true);
    }, []);

    const showConfirm = useCallback((
        title: string, 
        message: string, 
        onConfirm: () => void, 
        type: AlertType = 'warning', 
        confirmText = 'Confirmar',
        cancelText = 'Cancelar'
    ) => {
        setTitle(title);
        setMessage(message);
        setType(type);
        setShowCancel(true);
        setConfirmText(confirmText);
        setCancelText(cancelText);
        setOnConfirmCallback(() => onConfirm);
        setIsOpen(true);
    }, []);

    const AlertComponent = (
        <CustomAlert
            isOpen={isOpen}
            title={title}
            message={message}
            type={type}
            showCancel={showCancel}
            confirmText={confirmText}
            cancelText={cancelText}
            onConfirm={handleConfirm}
            onCancel={closeAlert}
        />
    );

    return { showAlert, showConfirm, AlertComponent };
}
