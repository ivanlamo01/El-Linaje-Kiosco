import { collection, query, where, getDocs, Timestamp, orderBy } from "firebase/firestore";
import { db } from "../config/firebase";
import { Sale } from "../types/saleTypes";

// Definimos tipos locales para métricas
export interface DailyFinancial {
    date: string; // formato YYYY-MM-DD
    sales: number;
    expenses: number;
    profit: number;
    [key: string]: string | number;
}

export interface TopProduct {
    name: string;
    quantity: number;
    revenue: number;
    [key: string]: string | number;
}

export interface PaymentStat {
    name: string;
    value: number;
    [key: string]: string | number;
}

interface FirestoreExpense {
    date: string;
    amount: string | number;
    description?: string;
    category?: string;
}

export const getAnalyticsData = async (startDate: Date, endDate: Date) => {
    // Ajuste de fechas para cubrir todo el rango (Local Time)
    // startDate y endDate vienen como objetos Date desde el frontend (que ya podrían tener hora local 00:00 o UTC)
    // Pero si vienen de inputs HTML date, a veces browser inconsistencies aplican.
    // Vamos a asumir que recibimos Dates válidos y forzamos el inicio/fin del día EN LOCAL.

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // FIX: Si startDate se creó parseando un string "YYYY-MM-DD" en UTC, al hacer setHours(0) en local
    // podría haber cambiado de día.
    // Para mayor seguridad, reconstruimos usando los componentes del día original si startDate viene de un input.
    // Pero aquí la función recibe 'Date'. Asumimos que quien llama (page.tsx) construyó bien la fecha?
    // En page.tsx: new Date(startDateString). Esto ES el problema.
    // Deberíamos arreglarlo AQUÍ o en page.tsx.
    // Mejor arreglarlo aquí parseando las componentes si es necesario, o confiar en que 'start'
    // representa el momento en el tiempo correcto.

    // Si la llamada fue getAnalyticsData(new Date("2026-01-22"), ...)
    // Entonces start es Jan 21 21:00 (Arg).
    // start.setHours(0) -> Jan 21 00:00. WRONG.

    // Solución: Extraer año/mes/día LOCALES del objeto Date original si se asume que representa el día correcto en UTC
    // O mejor, ignorar el objeto Date y pedir strings "YYYY-MM-DD".
    // Dato: la firma es (startDate: Date).

    // Hack robusto: Usar getFullYear/Month/Date del objeto pasado no sirve si ya está shifteado.
    // Pero si el objeto se creó con new Date("2026-01-22"), getUTCDate() da 22. getDate() da 21.
    // Si asumimos que el input era "2026-01-22", queremos el día 22 LOCAL.
    // Entonces:
    const dStart = new Date(startDate);
    const dEnd = new Date(endDate);

    // Ajuste "Universal" para inputs de fecha:
    // Si la fecha entra como UTC midnight (bias de parsing), la convertimos a Local Midnight del día UTC.
    // Esto asume que la intención del usuario al elegir "22 de Enero" es "22 de Enero comienza a las 00:00 Local".

    const startYear = dStart.getUTCFullYear();
    const startMonth = dStart.getUTCMonth();
    const startDay = dStart.getUTCDate();

    const endYear = dEnd.getUTCFullYear();
    const endMonth = dEnd.getUTCMonth();
    const endDay = dEnd.getUTCDate();

    const startLocal = new Date(startYear, startMonth, startDay, 0, 0, 0, 0);
    const endLocal = new Date(endYear, endMonth, endDay, 23, 59, 59, 999);

    // Usamos startLocal y endLocal para query


    // 1. Fetch Sales
    const salesRef = collection(db, "sales");
    const salesQuery = query(
        salesRef,
        where("timestamp", ">=", Timestamp.fromDate(startLocal)),
        where("timestamp", "<=", Timestamp.fromDate(endLocal)),
        orderBy("timestamp", "asc")
    );
    const salesSnap = await getDocs(salesQuery);
    const sales = salesSnap.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            ...data,
            total: Number(data.total) || 0,
            date: data.timestamp // Map timestamp to date property expected by Sale interface
        } as Sale;
    }).filter(s => s.date && s.date.toDate); // Filter out invalid sales

    // 2. Fetch Expenses
    const expensesRef = collection(db, "expenses");
    // Expenses are stored as YYYY-MM-DD strings.
    const toISODate = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const startIso = toISODate(startLocal);
    const endIso = toISODate(endLocal) + "T23:59:59";

    const expensesQuery = query(
        expensesRef,
        where("date", ">=", startIso),
        where("date", "<=", endIso),
        orderBy("date", "asc")
    );
    const expensesSnap = await getDocs(expensesQuery);
    const expenses = expensesSnap.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            date: data.date,
            amount: data.amount,
            description: data.description,
            category: data.category
        } as FirestoreExpense & { id: string };
    });

    // --- Aggregation Logic ---

    // A. Daily Financials
    const dailyMap = new Map<string, DailyFinancial>();

    // Helper date key using same logic as expenses (YYYY-MM-DD)
    const getDateKey = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    sales.forEach(sale => {
        if (!sale.date) return;
        const date = sale.date.toDate();
        const key = getDateKey(date);

        if (!dailyMap.has(key)) dailyMap.set(key, { date: key, sales: 0, expenses: 0, profit: 0 });
        const entry = dailyMap.get(key)!;
        entry.sales += sale.total;
        entry.profit += sale.total; // Profit starts as sales - expenses
    });

    expenses.forEach(exp => {
        // exp.date is already YYYY-MM-DD string
        const key = exp.date;

        if (!dailyMap.has(key)) dailyMap.set(key, { date: key, sales: 0, expenses: 0, profit: 0 });
        const entry = dailyMap.get(key)!;
        const amount = parseFloat(String(exp.amount)) || 0;
        entry.expenses += amount;
        entry.profit -= amount;
    });

    const dailyFinancials = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // B. Top Products
    const productMap = new Map<string, TopProduct>();
    sales.forEach(sale => {
        if (sale.products && Array.isArray(sale.products)) {
            sale.products.forEach(p => {
                const price = Number(p.price) || 0;
                const quantity = Number(p.quantity) || 0;
                if (!productMap.has(p.title)) productMap.set(p.title, { name: p.title, quantity: 0, revenue: 0 });
                const entry = productMap.get(p.title)!;
                entry.quantity += quantity;
                entry.revenue += (price * quantity);
            });
        }
    });
    const topProducts = Array.from(productMap.values())
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5); // Top 5

    // C. Payment Methods
    const paymentMap = new Map<string, number>();
    sales.forEach(sale => {
        const method = sale.paymentMethod || "Desconocido";
        paymentMap.set(method, (paymentMap.get(method) || 0) + sale.total);
    });
    const paymentStats = Array.from(paymentMap.entries()).map(([name, value]) => ({ name, value }));

    // D. Totals
    const totalIncome = dailyFinancials.reduce((acc, d) => acc + d.sales, 0);
    const totalExpense = dailyFinancials.reduce((acc, d) => acc + d.expenses, 0);
    const netProfit = totalIncome - totalExpense;
    const totalOrders = sales.length;

    return {
        dailyFinancials,
        topProducts,
        paymentStats,
        totals: {
            totalIncome,
            totalExpense,
            netProfit,
            totalOrders
        }
    };
};
