"use client";

import React, { useEffect, useState } from "react";
import { collection, query, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "../config/firebase";

interface Expense {
  id: string;
  description: string;
  amount: number;
  date?: Date;
}

const ExpensesTableCar: React.FC = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);

  useEffect(() => {
    const loadExpenses = async () => {
      const q = query(
        collection(db, "expenses"),
        orderBy("date", "desc"),
        limit(5)
      );
      const querySnapshot = await getDocs(q);

      const expensesList: Expense[] = querySnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          description: data.description || "Sin descripción",
          amount: Number(data.amount) || 0,
          date: data.date?.toDate ? data.date.toDate() : undefined,
        };
      });

      setExpenses(expensesList);
    };

    loadExpenses();
  }, []);

  return (
    <div className="bg-card p-6 rounded-2xl shadow-lg border border-border">
      <h3 className="text-2xl font-bold text-primary mb-2">Últimos Gastos</h3>
      <h5 className="text-sm text-muted-foreground mb-4">Registros recientes de egresos</h5>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm text-left border-collapse">
          <thead>
            <tr className="bg-secondary text-secondary-foreground uppercase text-xs">
              <th className="px-4 py-3 rounded-tl-lg">Descripción</th>
              <th className="px-4 py-3">Monto</th>
              <th className="px-4 py-3 rounded-tr-lg">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((expense, index) => (
              <tr
                key={expense.id || index}
                className="hover:bg-muted/50 transition-colors border-b border-border last:border-none"
              >
                <td className="px-4 py-3 font-medium text-foreground">
                  {expense.description}
                </td>
                <td className="px-4 py-3 text-red-500 font-semibold">
                  -${expense.amount.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {expense.date
                    ? expense.date.toLocaleDateString("es-AR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })
                    : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ExpensesTableCar;
