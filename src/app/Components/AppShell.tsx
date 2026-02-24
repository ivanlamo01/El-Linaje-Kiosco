"use client";

import { useAuthContext } from "../Context/AuthContext";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import NavBar from "./NavBar";
import MainLayout from "./MainLayout";

export default function AppShell({ children }: { children: React.ReactNode }) {
    const { login, loading } = useAuthContext();
    const router = useRouter();
    const pathname = usePathname();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);

        // Intentar sincronizar productos y ventas si estamos en Electron
        const syncData = async () => {
            const { productService } = await import("../lib/services/productService");
            const { saleService } = await import("../lib/services/saleService");
            const { categoryService } = await import("../lib/services/categoryService");

            await productService.syncPendingProducts(); // Sync local -> Firestore first
            await productService.syncFromFirestore();
            await saleService.syncPendingSales();
            await saleService.syncFromFirestore();
            await categoryService.syncFromFirestore();
        };
        syncData();
    }, []);

    useEffect(() => {
        // Wait for auth to finish loading before redirecting
        if (loading) return;

        // Si no está logueado y no está en login o afip-cert, redirigir
        if (!login && pathname !== "/login" && pathname !== "/afip-cert") {
            router.push("/login");
        }
    }, [login, loading, pathname, router]);

    // Evitar flash de contenido incorrecto antes de montar
    if (!mounted) return null;

    // Show loading state while auth is being checked
    if (loading) {
        console.log("AppShell: Loading state active");
        return (
            <div className="flex h-screen items-center justify-center bg-background" style={{ backgroundColor: 'white', color: 'black' }}>
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-muted-foreground animate-pulse">Cargando aplicación...</p>
                </div>
            </div>
        );
    }

    console.log("AppShell: Pathname is", pathname);

    if (pathname === "/login" || pathname === "/afip-cert" || pathname?.startsWith("/login")) {
        console.log("AppShell: Rendering public page");
        return <>{children}</>;
    }

    if (!login) {
        console.log("AppShell: Not logged in, rendering null (should redirect)");
        return (
            <div style={{ padding: 20, background: 'white', color: 'red' }}>
                Redirecting to login... (Status: {login ? 'Logged In' : 'Logged Out'})
                <br/>
                Current Path: {pathname}
            </div>
        );
    }

    return (
        <>
            <NavBar />
            <MainLayout>
                {children}
            </MainLayout>
        </>
    );
}
