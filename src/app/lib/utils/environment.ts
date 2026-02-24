import { Capacitor } from '@capacitor/core';

// Detecta si la app está corriendo en Electron
export function isElectron(): boolean {
    if (typeof window === 'undefined') return false;
    return !!window.electron;
}

export function isNative(): boolean {
    return isElectron() || Capacitor.isNativePlatform();
}

// Obtiene el objeto electron si está disponible
export function getElectronAPI() {
    if (typeof window !== 'undefined' && window.electron) {
        // Permitimos acceso a propiedades adicionales no definidas en el tipo global estricto
        return window.electron as NonNullable<typeof window.electron> & { [key: string]: unknown };
    }
    return null;
}

// Detecta si hay conexión a internet (para sync)
export async function isOnline(): Promise<boolean> {
    if (typeof navigator === 'undefined') return false;

    if (!navigator.onLine) return false;

    // Intenta hacer ping a un endpoint confiable
    try {
        await fetch('https://www.google.com/favicon.ico', {
            mode: 'no-cors',
            cache: 'no-store'
        });
        return true;
    } catch {
        return false;
    }
}
