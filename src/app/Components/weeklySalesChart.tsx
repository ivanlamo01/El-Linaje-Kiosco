"use client";
import React, { useEffect, useState } from "react";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from "recharts";
import { FaArrowUp, FaArrowDown } from "react-icons/fa";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../config/firebase";

interface WeeklyData {
    day: string;
    current: number;
    previous: number;
}

const WeeklySalesChart: React.FC = () => {
    const [weeklySalesData, setWeeklySalesData] = useState<WeeklyData[]>([]);
    const [totalWeeklySales, setTotalWeeklySales] = useState<number>(0);
    const [totalPreviousWeekSales, setTotalPreviousWeekSales] = useState<number>(0);

    useEffect(() => {
        const loadWeeklySalesComparison = async () => {
            try {
                const today = new Date();
                const dayOfWeek = today.getDay();
                const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

                const mondayThisWeek = new Date();
                mondayThisWeek.setDate(today.getDate() - daysSinceMonday);
                mondayThisWeek.setHours(0, 0, 0, 0);

                const mondayLastWeek = new Date(mondayThisWeek);
                mondayLastWeek.setDate(mondayThisWeek.getDate() - 7);

                const todayLastWeek = new Date(today);
                todayLastWeek.setDate(today.getDate() - 7);

                const salesQueryThisWeek = query(
                    collection(db, "sales"),
                    where("timestamp", ">=", mondayThisWeek),
                    where("timestamp", "<=", today)
                );
                const salesQueryLastWeek = query(
                    collection(db, "sales"),
                    where("timestamp", ">=", mondayLastWeek),
                    where("timestamp", "<=", todayLastWeek)
                );

                const [salesThisWeekSnap, salesLastWeekSnap] = await Promise.all([
                    getDocs(salesQueryThisWeek),
                    getDocs(salesQueryLastWeek),
                ]);

                const days = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
                const thisWeekData: Record<string, number> = Object.fromEntries(days.map((d) => [d, 0]));
                const lastWeekData: Record<string, number> = Object.fromEntries(days.map((d) => [d, 0]));

                let totalThisWeek = 0;
                let totalLastWeek = 0;

                // Procesar esta semana
                salesThisWeekSnap.forEach((doc) => {
                    const sale = doc.data();
                    const date = new Date(sale.timestamp.toDate());
                    const day = days[(date.getDay() + 6) % 7];
                    (sale.products as { price: number; quantity: number }[]).forEach((product) => {
                        if (product.price && product.quantity) {
                            const subtotal = product.price * product.quantity;
                            thisWeekData[day] += subtotal;
                            totalThisWeek += subtotal;
                        }
                    });
                });

                // Procesar semana pasada
                salesLastWeekSnap.forEach((doc) => {
                    const sale = doc.data();
                    const date = new Date(sale.timestamp.toDate());
                    const day = days[(date.getDay() + 6) % 7];
                    (sale.products as { price: number; quantity: number }[]).forEach((product) => {
                        if (product.price && product.quantity) {
                            const subtotal = product.price * product.quantity;
                            lastWeekData[day] += subtotal;
                            totalLastWeek += subtotal;
                        }
                    });
                });

                // Dataset para gráfico
                const chartData = days.map((d) => ({
                    day: d,
                    current: thisWeekData[d],
                    previous: lastWeekData[d],
                }));

                setWeeklySalesData(chartData);
                setTotalWeeklySales(totalThisWeek);
                setTotalPreviousWeekSales(totalLastWeek);
            } catch (error) {
                console.error("Error loading weekly sales comparison:", error);
            }
        };

        loadWeeklySalesComparison();
    }, []);

    const percentageDifference =
        totalPreviousWeekSales > 0
            ? parseFloat(
                (((totalWeeklySales - totalPreviousWeekSales) / totalPreviousWeekSales) * 100).toFixed(1)
            )
            : 0.0;

    return (
        <div className="w-full">
            <h5 className="text-muted-foreground text-sm">Ventas Semanales</h5>
            <h2 className="text-3xl font-bold text-primary">
                Total: ${totalWeeklySales.toLocaleString()}
            </h2>
            <span
                className={`text-sm font-semibold ${percentageDifference >= 0 ? "text-green-500" : "text-red-500"
                    }`}
            >
                {percentageDifference >= 0 ? (
                    <FaArrowUp className="inline mr-1" />
                ) : (
                    <FaArrowDown className="inline mr-1" />
                )}
                {percentageDifference}% vs semana pasada
            </span>

            {/* Gráfico */}
            <div className="h-64 mt-4 text-xs">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={weeklySalesData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="day" stroke="var(--muted-foreground)" tick={{ fill: 'var(--muted-foreground)' }} />
                        <YAxis stroke="var(--muted-foreground)" tick={{ fill: 'var(--muted-foreground)' }} />
                        <Tooltip
                            contentStyle={{ backgroundColor: 'var(--popover)', borderColor: 'var(--border)', color: 'var(--popover-foreground)' }}
                            itemStyle={{ color: 'var(--popover-foreground)' }}
                        />
                        <Line
                            type="monotone"
                            dataKey="current"
                            stroke="var(--primary)"
                            strokeWidth={2}
                            dot={{ r: 4, fill: 'var(--primary)' }}
                            name="Actual"
                        />
                        <Line
                            type="monotone"
                            dataKey="previous"
                            stroke="#a1a1aa"
                            strokeWidth={2}
                            dot={{ r: 4, fill: '#a1a1aa' }}
                            name="Anterior"
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default WeeklySalesChart;
