import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./Context/AuthContext";
import { CartProvider } from "./Context/CartContext";
import { SidebarProvider } from "./Context/SidebarContext";
import { Providers } from "./Components/Providers";
import AppShell from "./Components/AppShell";
import LightModeBackground from "./Components/LightModeBackground";

const interVariable = "--font-inter";

export const metadata: Metadata = {
  title: "El Linaje Kiosco",
  description: "Sistema de gestión de inventario y ventas",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`antialiased font-sans`}
      >
        <Providers>
          <LightModeBackground />
          <AuthProvider>
            <CartProvider>
              <SidebarProvider>
                <AppShell>
                  {children}
                </AppShell>
              </SidebarProvider>
            </CartProvider>
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
