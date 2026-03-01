"use client";

import React, { useEffect, useState } from "react";
import { useAuthContext } from "../Context/AuthContext";
import Link from "next/link";
import { useSidebar } from "../Context/SidebarContext";
import { useTutorial } from "../Context/TutorialContext";
import ThemeToggle from "./ThemeToggle";
import {
  FaHome,
  FaBoxOpen,
  FaShoppingCart,
  FaUsers,
  FaUserFriends,
  FaChartLine,
  FaFileInvoiceDollar,
  FaFileInvoice,
  FaChartPie,
  FaSignInAlt,
  FaSignOutAlt,
  FaChevronLeft,
  FaChevronRight,
  FaBars,
  FaTimes,
  FaUserCircle,
  FaUserCog,
  FaCaretDown
} from "react-icons/fa";

const NavBar: React.FC = () => {
  const { login, handleLogout, user } = useAuthContext();
  const { isCollapsed, toggleSidebar } = useSidebar();
  const { startTutorial } = useTutorial();
  const [mounted, setMounted] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <>
      {/* --- MOBILE HEADER (Visible only on lg:hidden) --- */}
      <header 
        className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md border-b border-border flex items-center justify-between px-4 py-3 lg:hidden shadow-sm transition-colors duration-300 sidebar-bg"
      >
        <div className="flex items-center">
          <img 
            src="/Ellinaje.png" 
            alt="El Linaje Logo" 
            className="h-16 w-auto drop-shadow-md brightness-0 invert transition-all duration-300" 
          />
        </div>
        <button
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="text-primary-foreground/80 dark:text-muted-foreground focus:outline-none p-2 rounded-lg hover:bg-black/10 dark:hover:bg-secondary hover:text-primary-foreground transition-colors"
        >
          {isMobileOpen ? <FaTimes size={24} /> : <FaBars size={24} />}
        </button>
      </header>

      {/* --- SIDEBAR --- */}
      <aside
        className={`fixed top-0 left-0 h-screen border-r border-border flex flex-col shadow-xl z-40 sidebar-bg
        transition-all duration-300 ease-in-out
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        ${isCollapsed ? "lg:w-20" : "lg:w-64"}
        w-64
        `}
      >
        {/* LOGO AREA (Desktop) */}
        <div id="sidebar-logo" className={`flex items-center justify-center py-6 border-b border-border transition-all duration-300 ${isCollapsed ? "px-2" : "px-4"}`}>
          <img
            src="/Ellinaje.png"
            alt="El Linaje"
            className={`transition-all duration-300 drop-shadow-md brightness-0 invert ${isCollapsed ? "w-14 h-14 object-contain" : "w-36 h-36 object-contain"}`}
          />
        </div>

        {/* USER INFO */}
        {login && (
          <div className="relative">
            <div 
              id="sidebar-user" 
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              className={`flex items-center p-4 border-b border-border bg-card text-card-foreground transition-all duration-300 cursor-pointer hover:brightness-95 ${isCollapsed ? "justify-center" : "gap-3"}`}
            >
              <div className="bg-primary p-2.5 rounded-full text-foreground/80">
                <FaUserCircle size={20} />
              </div>
              {!isCollapsed && (
                <>
                  <div className="overflow-hidden flex-1">
                    <p className="text-sm font-semibold text-foreground truncate w-24">
                      {user?.nombre || "Usuario"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate w-24">
                      {user?.email}
                    </p>
                  </div>
                  <FaCaretDown className={`text-muted-foreground transition-transform duration-200 ${userDropdownOpen ? "rotate-180" : ""}`} size={12}/>
                </>
              )}
            </div>

            {/* User Dropdown */}
            {userDropdownOpen && (
              <div className={`absolute z-50 bg-popover border border-border rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 w-48 
                ${isCollapsed ? "left-full top-0 ml-2" : "left-4 right-4 top-full mt-2"}`}>
                 <Link 
                   href="/profile" 
                   onClick={() => setUserDropdownOpen(false)}
                   className="flex items-center gap-2 px-4 py-3 text-sm text-foreground hover:bg-accent transition-colors"
                 >
                   <FaUserCog className="text-primary"/> Mi Perfil
                 </Link>
                 <button 
                   onClick={() => {
                     handleLogout();
                     setUserDropdownOpen(false);
                   }}
                   className="w-full flex items-center gap-2 px-4 py-3 text-sm text-destructive hover:bg-destructive/10 transition-colors border-t border-border"
                 >
                   <FaSignOutAlt /> Cerrar Sesión
                 </button>
              </div>
            )}
          </div>
        )}

        {/* NAVIGATION LINKS */}
        <nav className="flex-1 flex flex-col py-4 gap-1 px-3 overflow-y-auto overflow-x-hidden custom-scrollbar">
          <NavItem id="nav-home" href="/" icon={<FaHome size={18} />} label="Home" collapsed={isCollapsed} onClick={() => setIsMobileOpen(false)} />
          
          {(user?.isAdmin || user?.permissions?.inventario) && (
            <NavItem id="nav-inventory" href="/inventario" icon={<FaBoxOpen size={18} />} label="Inventario" collapsed={isCollapsed} onClick={() => setIsMobileOpen(false)} />
          )}
          
          {(user?.isAdmin || user?.permissions?.cart) && (
            <NavItem id="nav-cart" href="/cart" icon={<FaShoppingCart size={18} />} label="Punto de Venta" collapsed={isCollapsed} onClick={() => setIsMobileOpen(false)} />
          )}
          
          {(user?.isAdmin || user?.permissions?.debtors) && (
             <NavItem id="nav-debtors" href="/debtors" icon={<FaUsers size={18} />} label="Deudores" collapsed={isCollapsed} onClick={() => setIsMobileOpen(false)} />
          )}
          
          {(user?.isAdmin || user?.permissions?.users) && (
             <NavItem id="nav-users" href="/users" icon={<FaUserFriends size={18} />} label="Usuarios" collapsed={isCollapsed} onClick={() => setIsMobileOpen(false)} />
          )}
          
          {(user?.isAdmin || user?.permissions?.sales) && (
            <NavItem id="nav-sales" href="/sales" icon={<FaFileInvoiceDollar size={18} />} label="Ventas" collapsed={isCollapsed} onClick={() => setIsMobileOpen(false)} />
          )}
          
          {(user?.isAdmin || user?.permissions?.facturacion) && (
            <NavItem id="nav-billing" href="/facturacion" icon={<FaFileInvoiceDollar size={18} />} label="Facturación" collapsed={isCollapsed} onClick={() => setIsMobileOpen(false)} />
          )}
          
          {(user?.isAdmin || user?.permissions?.facturas) && (
             <NavItem href="/facturas" icon={<FaFileInvoice size={18} />} label="Facturas" collapsed={isCollapsed} onClick={() => setIsMobileOpen(false)} />
          )}
          
          {(user?.isAdmin || user?.permissions?.expenses) && (
             <NavItem id="nav-expenses" href="/expenses" icon={<FaChartLine size={18} />} label="Gastos" collapsed={isCollapsed} onClick={() => setIsMobileOpen(false)} />
          )}
          
          {(user?.isAdmin || user?.permissions?.graficos) && (
            <NavItem id="nav-charts" href="/graficos" icon={<FaChartPie size={18} />} label="Gráficos" collapsed={isCollapsed} onClick={() => setIsMobileOpen(false)} />
          )}
        </nav>

        {/* FOOTER ACTIONS */}
        <div className="p-4 border-t border-border flex flex-col gap-2 sidebar-bg">
          {/* Toggle Button (Desktop Only) */}
          <button
            onClick={toggleSidebar}
            className="hidden lg:flex items-center justify-center w-full p-2 rounded-xl bg-black/10 dark:bg-secondary hover:bg-black/20 dark:hover:bg-secondary/80 text-primary-foreground dark:text-foreground transition-colors"
            title={isCollapsed ? "Expandir" : "Contraer"}
          >
            {isCollapsed ? <FaChevronRight /> : <FaChevronLeft />}
          </button>

          <ThemeToggle collapsed={isCollapsed} />

          {/* Tutorial Button */}
          <button
            id="btn-tutorial"
            onClick={() => startTutorial('general')}
            className={`hidden lg:flex items-center justify-center w-full p-2 rounded-xl bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/40 transition-colors ${isCollapsed ? "justify-center" : "gap-3"}`}
            title="Ver Tutorial"
          >
            <span className="text-lg">?</span>
            {!isCollapsed && <span className="font-semibold text-sm">Ayuda</span>}
          </button>

          {login ? null : (
            <Link
              href="/login"
              className={`flex items-center gap-3 p-3 rounded-xl text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/10 transition-all ${isCollapsed ? "justify-center" : ""}`}
              title="Iniciar Sesión"
            >
              <FaSignInAlt size={18} />
              {!isCollapsed && <span className="font-semibold text-sm">Entrar</span>}
            </Link>
          )}
        </div>
      </aside>

      {/* MOBILE OVERLAY */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        ></div>
      )}
    </>
  );
};

// Helper Component for Nav Items
const NavItem = ({ href, icon, label, collapsed, onClick, id }: { href: string; icon: React.ReactNode; label: string; collapsed: boolean; onClick?: () => void; id?: string }) => {
  return (
    <Link
      href={href}
      id={id}
      onClick={onClick}
      className={`
                group flex items-center gap-3 px-3 py-2.5 rounded-xl text-primary-foreground/90 dark:text-muted-foreground 
                hover:bg-black/10 dark:hover:bg-accent hover:text-primary-foreground dark:hover:text-accent-foreground transition-all duration-200
                ${collapsed ? "justify-center" : ""}
            `}
      title={collapsed ? label : ""}
    >
      <div className="group-hover:text-primary-foreground dark:group-hover:text-primary transition-colors">
        {icon}
      </div>
      {!collapsed && (
        <span className="font-medium text-sm whitespace-nowrap overflow-hidden transition-all duration-300 opacity-100">
          {label}
        </span>
      )}

      {/* Tooltip for collapsed mode */}
      {collapsed && (
        <div className="absolute left-16 bg-popover text-popover-foreground text-xs px-2 py-1 rounded shadow-md border border-border opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 whitespace-nowrap hidden lg:block">
          {label}
        </div>
      )}
    </Link>
  )
}

export default NavBar;
