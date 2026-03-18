import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./Context/AuthContext";
import { CartProvider } from "./Context/CartContext";
import { SidebarProvider } from "./Context/SidebarContext";
import { Providers } from "./Components/Providers";
import AppShell from "./Components/AppShell";

export const metadata: Metadata = {
  title: "EL Linaje Kiosco",
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
        className="antialiased"
      >
        <Providers>
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
