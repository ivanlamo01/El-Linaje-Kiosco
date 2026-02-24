"use client";

import { useState, useEffect } from "react";
import { getAnalyticsData, DailyFinancial, TopProduct, PaymentStat } from "../lib/analytics";
import { FaCalendarAlt, FaChartLine, FaChartPie, FaChartBar, FaMoneyBillWave, FaWallet, FaShoppingBag } from "react-icons/fa";
// Recharts imports for sub-components (implemented inline for simplicity or separated)
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell
} from "recharts";

export default function AnalyticsPage() {
    const [loading, setLoading] = useState(true);
    // Default: This Month
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

    const [startDate, setStartDate] = useState(firstDay.toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);

    const [data, setData] = useState<{
        dailyFinancials: DailyFinancial[];
        topProducts: TopProduct[];
        paymentStats: PaymentStat[];
        totals: {
            totalIncome: number;
            totalExpense: number;
            netProfit: number;
            totalOrders: number;
        }
    } | null>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const start = new Date(startDate);
            const end = new Date(endDate);
            const result = await getAnalyticsData(start, end);
            setData(result);
        } catch (error) {
            console.error("Error fetching analytics:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [startDate, endDate]);

    const COLORS = ['#F59E0B', '#10B981', '#3B82F6', '#EF4444', '#8B5CF6'];

    if (loading && !data) return (
        <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
    );

    return (
        <div className="min-h-screen bg-background text-foreground p-6 lg:p-8 transition-colors duration-300">
            <div className="max-w-7xl mx-auto space-y-8">

                {/* Header & Filters */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-primary flex items-center gap-3">
                            <FaChartLine /> Dashboard
                        </h1>
                        <p className="text-muted-foreground mt-1">Análisis de rendimiento y métricas clave</p>
                    </div>

                    <div className="flex items-center gap-3 bg-card border border-border p-2 rounded-xl shadow-sm">
                        <div className="relative">
                            <FaCalendarAlt className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="pl-9 pr-3 py-2 bg-input border border-input rounded-lg text-sm text-foreground focus:border-primary outline-none transition-colors"
                            />
                        </div>
                        <span className="text-muted-foreground">-</span>
                        <div className="relative">
                            <FaCalendarAlt className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="pl-9 pr-3 py-2 bg-input border border-input rounded-lg text-sm text-foreground focus:border-primary outline-none transition-colors"
                            />
                        </div>
                    </div>
                </div>

                {/* KPI Cards */}
                {data && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatCard
                            title="Ingresos Totales"
                            value={`$${data.totals.totalIncome.toFixed(2)}`}
                            icon={<FaMoneyBillWave />}
                            color="text-green-500"
                            bg="bg-green-500/10"
                        />
                        <StatCard
                            title="Gastos Totales"
                            value={`$${data.totals.totalExpense.toFixed(2)}`}
                            icon={<FaWallet />}
                            color="text-red-500"
                            bg="bg-red-500/10"
                        />
                        <StatCard
                            title="Ganancia Neta"
                            value={`$${data.totals.netProfit.toFixed(2)}`}
                            icon={<FaChartLine />}
                            color="text-amber-500"
                            bg="bg-amber-500/10"
                        />
                        <StatCard
                            title="Total Pedidos"
                            value={`${data.totals.totalOrders}`}
                            icon={<FaShoppingBag />}
                            color="text-blue-500"
                            bg="bg-blue-500/10"
                        />
                    </div>
                )}

                {/* Charts Grid */}
                {data && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                        {/* 1. Profit Chart (Main) */}
                        <div className="lg:col-span-2 bg-card border border-border p-6 rounded-2xl shadow-sm">
                            <h3 className="text-xl font-bold text-card-foreground mb-6 flex items-center gap-2">
                                <FaChartBar className="text-primary" /> Rentabilidad (Ventas vs Gastos)
                            </h3>
                            <div className="h-[350px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={data.dailyFinancials}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                        <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={12} tickMargin={10} />
                                        <YAxis stroke="var(--muted-foreground)" fontSize={12} tickFormatter={(val) => `$${val}`} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '8px', color: 'var(--card-foreground)' }}
                                            itemStyle={{ color: 'var(--foreground)' }}
                                            labelStyle={{ color: 'var(--muted-foreground)' }}
                                        />
                                        <Legend />
                                        <Bar dataKey="sales" name="Ventas" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={50} />
                                        <Bar dataKey="expenses" name="Gastos" fill="#EF4444" radius={[4, 4, 0, 0]} maxBarSize={50} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* 2. Top Products */}
                        <div className="bg-card border border-border p-6 rounded-2xl shadow-sm">
                            <h3 className="text-xl font-bold text-card-foreground mb-6 flex items-center gap-2">
                                <FaShoppingBag className="text-blue-500" /> Productos Más Vendidos
                            </h3>
                            <div className="h-[300px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart layout="vertical" data={data.topProducts} margin={{ left: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={true} vertical={false} />
                                        <XAxis type="number" stroke="var(--muted-foreground)" hide />
                                        <YAxis dataKey="name" type="category" stroke="var(--foreground)" fontSize={12} width={100} />
                                        <Tooltip
                                            cursor={{ fill: 'var(--muted)' }}
                                            contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', color: 'var(--card-foreground)' }}
                                            itemStyle={{ color: 'var(--foreground)' }}
                                        />
                                        <Bar dataKey="quantity" fill="#3B82F6" radius={[0, 4, 4, 0]} barSize={20} name="Unidades" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* 3. Payment Methods */}
                        <div className="bg-card border border-border p-6 rounded-2xl shadow-sm">
                            <h3 className="text-xl font-bold text-card-foreground mb-6 flex items-center gap-2">
                                <FaChartPie className="text-purple-500" /> Métodos de Pago
                            </h3>
                            <div className="h-[300px] w-full flex items-center justify-center">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={data.paymentStats}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={100}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {data.paymentStats.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="var(--card)" strokeWidth={2} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            formatter={(val: number) => `$${val.toFixed(2)}`}
                                            contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', color: 'var(--card-foreground)' }}
                                            itemStyle={{ color: 'var(--foreground)' }}
                                        />
                                        <Legend verticalAlign="bottom" height={36} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// Mini Component for Cards
interface StatCardProps {
    title: string;
    value: string;
    icon: React.ReactNode;
    color: string;
    bg: string;
}

function StatCard({ title, value, icon, color, bg }: StatCardProps) {
    return (
        <div className="bg-card border border-border p-5 rounded-2xl shadow-sm flex items-center gap-4 hover:translate-y-[-2px] transition-transform hover:shadow-md">
            <div className={`p-4 rounded-xl ${bg} ${color}`}>
                <div className="text-2xl">{icon}</div>
            </div>
            <div>
                <p className="text-muted-foreground text-xs font-bold uppercase tracking-wider">{title}</p>
                <p className={`text-2xl font-bold text-card-foreground mt-1`}>{value}</p>
            </div>
        </div>
    );
}

