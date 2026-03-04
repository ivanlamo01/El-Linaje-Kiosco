"use client";

import React, { createContext, useContext, useState } from 'react';
import { driver, DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { usePathname } from 'next/navigation';

interface TutorialContextType {
  startTutorial: (type?: 'general' | 'specific') => void;
  isRunning: boolean;
}

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

export const TutorialProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isRunning, setIsRunning] = useState(false);
  const pathname = usePathname();

  const startTutorial = (type: 'general' | 'specific' = 'general') => {
    setIsRunning(true);
    
    let steps: DriveStep[] = [];

    // --- 1. TUTORIAL GENERAL (Se muestra en otras rutas o Home) ---
    const generalSteps: DriveStep[] = [
        { 
            element: '#sidebar-logo', 
            popover: { 
                title: 'Bienvenido a El Linaje Kiosko', 
                description: 'Este es el panel principal de administración. Aquí podrás navegar por todas las secciones de tu sistema.',
                popoverClass: 'driverjs-theme'
            } 
        },
        { 
            element: '#nav-home', 
            popover: { 
                title: 'Inicio', 
                description: 'Vuelve a la pantalla principal para ver un resumen de tu actividad.',
                popoverClass: 'driverjs-theme'
            } 
        },
        { 
            element: '#nav-inventory', 
            popover: { 
                title: 'Inventario', 
                description: 'Gestiona tus productos. Agrega nuevos productos, modifica precios y controla el stock.',
                popoverClass: 'driverjs-theme'
            } 
        },
        { 
            element: '#nav-cart', 
            popover: { 
                title: 'Punto de Venta', 
                description: 'Aquí es donde realizas las ventas diarias. Agrega productos al carrito y finaliza la compra.',
                popoverClass: 'driverjs-theme'
            } 
        },
         { 
            element: '#nav-debtors', 
            popover: { 
                title: 'Deudores', 
                description: 'Lleva el control de las cuentas corrientes y deudas de tus clientes.',
                popoverClass: 'driverjs-theme'
            } 
        },
        { 
            element: '#nav-sales', 
            popover: { 
                title: 'Historial de Ventas', 
                description: 'Consulta el historial completo de todas las ventas realizadas.',
                popoverClass: 'driverjs-theme'
            } 
        },
        { 
            element: '#nav-billing', 
            popover: { 
                title: 'Facturación', 
                description: 'Emite facturas fiscales y gestiona documentos tributarios.',
                popoverClass: 'driverjs-theme'
            } 
        },
        { 
            element: '#nav-expenses', 
            popover: { 
                title: 'Gastos', 
                description: 'Registra los gastos del negocio para tener un balance real.',
                popoverClass: 'driverjs-theme'
            } 
        },
        { 
            element: '#nav-charts', 
            popover: { 
                title: 'Gráficos y Estadísticas', 
                description: 'Visualiza el rendimiento de tu negocio con gráficos detallados.',
                popoverClass: 'driverjs-theme'
            } 
        },
        { 
            element: '#sidebar-user', 
            popover: { 
                title: 'Perfil de Usuario', 
                description: 'Aquí puedes ver quién ha iniciado sesión.',
                popoverClass: 'driverjs-theme'
            } 
        },
        { 
            element: '#btn-tutorial', 
            popover: { 
                title: 'Tutorial', 
                description: 'Si necesitas ayuda nuevamente, puedes hacer clic aquí para ver este tutorial o el específico de la sección donde te encuentres.',
                popoverClass: 'driverjs-theme'
            } 
        },
    ];

    // --- 2. TUTORIAL INVENTARIO ---
    const inventorySteps: DriveStep[] = [
        {
            element: '#inventory-table',
            popover: {
                title: 'Gestión de Inventario',
                description: 'Esta es tu área de trabajo principal. Aquí se lista todo tu catálogo de productos.',
                side: 'top',
                popoverClass: 'driverjs-theme'
            }
        },
        {
            element: '#btn-add-product',
            popover: {
                title: 'Agregar Nuevo Producto',
                description: 'Haz clic aquí para crear un nuevo producto. Podrás ingresar nombre, precio, stock y código de barras.',
                popoverClass: 'driverjs-theme'
            }
        },
         {
            element: '#btn-add-category',
            popover: {
                title: 'Gestionar Categorías',
                description: 'Organiza tus productos en categorías (ej: Bebidas, Limpieza). Esto facilita el filtrado y búsqueda.',
                popoverClass: 'driverjs-theme'
            }
        },
        {
            element: '#search-input',
            popover: {
                title: 'Buscador Rápido',
                description: 'Teclea el nombre o escanea el código de barras aquí para encontrar un producto instantáneamente.',
                popoverClass: 'driverjs-theme'
            }
        },
        {
            element: '#filter-category',
            popover: {
                title: 'Filtrar por Categoría',
                description: 'Despliega esta lista para ver solo los productos de una categoría específica.',
                popoverClass: 'driverjs-theme'
            }
        },
        {
            element: '#filter-stock',
            popover: {
                title: 'Control de Stock',
                description: 'Usa este filtro para ver rápidamente qué productos se están agotando (Stock Bajo) o ya no tienen existencias.',
                popoverClass: 'driverjs-theme'
            }
        },
    ];

    // --- 3. TUTORIAL CART (Punto de Venta) ---
    const cartSteps: DriveStep[] = [
        {
            element: '#search-barcode-form',
            popover: {
                title: 'Escaneo Rápido',
                description: 'Aquí puedes usar tu lector de códigos de barras. Simplemente escanea un producto y se agregará automáticamente al carrito.',
                popoverClass: 'driverjs-theme'
            }
        },
        {
            element: '#search-title-form',
            popover: {
                title: 'Búsqueda Manual',
                description: 'Si no tienes el código a mano, escribe el nombre del producto aquí para buscarlo en tu base de datos.',
                popoverClass: 'driverjs-theme'
            }
        },
        {
            element: '#cart-items-table',
            popover: {
                title: 'Detalle de Compra',
                description: 'Aquí verás la lista de productos agregados. Puedes modificar la cantidad directamente o eliminar items si es necesario.',
                popoverClass: 'driverjs-theme'
            }
        },
        {
            element: '#cart-summary',
            popover: {
                title: 'Resumen Total',
                description: 'Visualiza el total a pagar y la cantidad de items en tiempo real.',
                popoverClass: 'driverjs-theme'
            }
        },
        {
            element: '#confirm-sale-btn',
            popover: {
                title: 'Finalizar Venta',
                description: 'Cuando todo esté listo, presiona este botón para elegir el método de pago y emitir el comprobante.',
                popoverClass: 'driverjs-theme'
            }
        },
    ];

    // --- 4. TUTORIAL DEUDORES ---
    const debtorsSteps: DriveStep[] = [
        {
            element: '#debtors-page-title',
            popover: { 
                title: 'Gestión de Deudores', 
                description: 'Aquí podrás administrar las cuentas corrientes de tus clientes saldo, pagos e historiales.',
                popoverClass: 'driverjs-theme'
            }
        },
        {
            element: '#btn-add-debtor',
            popover: { 
                title: 'Nuevo Deudor', 
                description: 'Hacé clic acá para registrar un nuevo cliente al sistema.',
                popoverClass: 'driverjs-theme'
            }
        },
        {
            element: '#debtors-list-container',
            popover: { 
                title: 'Lista de Clientes', 
                description: 'Acá verás el listado de todos tus deudores. Si la lista está vacía, ¡empezá agregando uno!',
                popoverClass: 'driverjs-theme'
            }
        },
        {
            element: '#first-debtor-card',
            popover: { 
                title: 'Tarjeta de Cliente', 
                description: 'Cada tarjeta muestra el saldo actual. Hacé clic en la tarjeta para expandir y ver el historial detallado.',
                popoverClass: 'driverjs-theme'
            }
        },
        {
            element: '#first-debtor-pay-btn',
            popover: { 
                title: 'Registrar Pago', 
                description: 'Usá este botón para asentar un pago. El saldo se actualizará automáticamente.',
                popoverClass: 'driverjs-theme'
            }
        },
        {
            element: '#first-debtor-toggle-status',
            popover: { 
                title: 'Cerrar/Abrir Cuenta', 
                description: 'Podés bloquear la cuenta para que no se sumen más deudas momentáneamente.',
                popoverClass: 'driverjs-theme'
            }
        }
    ];

    // --- 5. TUTORIAL VENTAS ---
    const salesSteps: DriveStep[] = [
        {
            element: '#sales-page-title',
            popover: { 
                title: 'Historial de Ventas', 
                description: 'Aquí puedes revisar todas las ventas realizadas, filtrar por fecha y ver el detalle de cada operación.',
                popoverClass: 'driverjs-theme'
            }
        },
        {
            element: '#sales-total-card',
            popover: { 
                title: 'Total del Período', 
                description: 'Este cuadro te muestra la suma total de dinero ingresado por ventas en el rango de fechas seleccionado.',
                popoverClass: 'driverjs-theme'
            }
        },
        {
            element: '#sales-filter-section',
            popover: { 
                title: 'Filtros de Fecha', 
                description: 'Usa estos campos para buscar ventas de un día específico o un rango de fechas. No olvides presionar "Aplicar Filtro".',
                popoverClass: 'driverjs-theme'
            }
        },
        {
            element: '#sales-list-container',
            popover: { 
                title: 'Listado de Ventas', 
                description: 'Aquí aparecerán las ventas encontradas, ordenadas cronológicamente.',
                popoverClass: 'driverjs-theme'
            }
        },
        {
            element: '#first-sale-card',
            popover: { 
                title: 'Tarjeta de Venta', 
                description: 'Cada tarjeta representa una venta. Muestra la fecha, el monto total y la cantidad de items.',
                popoverClass: 'driverjs-theme'
            }
        },
        {
            element: '#first-sale-header',
            popover: { 
                title: 'Ver Detalle', 
                description: 'Haz clic en cualquier parte de la tarjeta para desplegar el detalle completo de los productos vendidos y opciones de facturación.',
                popoverClass: 'driverjs-theme'
            }
        }
    ];

    // --- 6. TUTORIAL GASTOS ---
    const expensesSteps: DriveStep[] = [
        {
            element: '#expenses-page-title',
            popover: { 
                title: 'Control de Gastos', 
                description: 'Aquí puedes registrar todas las salidas de dinero (luz, alquiler, mercadería, etc.) para mantener tu caja balanceada.',
                popoverClass: 'driverjs-theme'
            }
        },
        {
            element: '#total-expenses-card',
            popover: { 
                title: 'Total Acumulado', 
                description: 'Muestra la suma total de todos los gastos registrados. Útil para saber rápidamente cuánto has gastado.',
                popoverClass: 'driverjs-theme'
            }
        },
        {
            element: '#btn-add-expense',
            popover: { 
                title: 'Registrar Nuevo Gasto', 
                description: 'Presiona aquí para abrir el formulario donde podrás ingresar la descripción, monto y fecha del gasto.',
                popoverClass: 'driverjs-theme'
            }
        },
        {
            element: '#expenses-list',
            popover: { 
                title: 'Listado de Gastos', 
                description: 'Aquí verás el historial completo ordenado por fecha, del más reciente al más antiguo.',
                popoverClass: 'driverjs-theme'
            }
        },
        {
            element: '#first-expense-item',
            popover: { 
                title: 'Gestionar Gasto', 
                description: 'Cada fila te permite ver el detalle. Usa los botones de la derecha para Editar o Eliminar un registro si te equivocaste.',
                popoverClass: 'driverjs-theme'
            }
        }
    ];

    // DECIDIR QUÉ TUTORIAL MOSTRAR
    const normalizedPath = pathname?.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;

    if (type === 'specific') {
        if (normalizedPath === '/inventario') steps = inventorySteps;
        else if (normalizedPath === '/cart') steps = cartSteps;
        else if (normalizedPath === '/debtors') steps = debtorsSteps;
        else if (normalizedPath === '/sales') steps = salesSteps;
        else if (normalizedPath === '/expenses') steps = expensesSteps;
        else steps = generalSteps; // Fallback or maybe empty
    } else {
        steps = generalSteps;
    }

    const driverObj = driver({
      showProgress: true,
      animate: true,
      allowClose: true,
      nextBtnText: 'Siguiente →',
      prevBtnText: '← Anterior',
      doneBtnText: '¡Entendido!',
      onDestroyStarted: () => {
           driverObj.destroy();
           setIsRunning(false);
      },
      steps: steps
    });
    
    driverObj.drive();
  };

  return (
    <TutorialContext.Provider value={{ startTutorial, isRunning }}>
      {children}
    </TutorialContext.Provider>
  );
};

export const useTutorial = () => {
  const context = useContext(TutorialContext);
  if (context === undefined) {
    throw new Error('useTutorial must be used within a TutorialProvider');
  }
  return context;
};
