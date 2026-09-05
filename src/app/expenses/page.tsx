"use client";
import React, { useEffect, useState } from "react";
import {
  collection,
  query,
  orderBy,
  getDocs,
  addDoc,
  doc,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { useTutorial } from "../Context/TutorialContext";
import { FaWallet, FaPlus, FaEdit, FaTrash, FaSave, FaCalendarAlt, FaDonate, FaMoneyBillWave, FaQuestion } from "react-icons/fa";

type Expense = {
  id: string;
  description: string;
  amount: string;
  date: string;
  provider: string;
  paymentType: string;
};

const ExpensesTable = () => {
  const { startTutorial } = useTutorial();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [newExpense, setNewExpense] = useState<Omit<Expense, "id">>({
    description: "",
    amount: "",
    date: "",
    provider: "",
    paymentType: "momento",
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadExpenses = async () => {
      try {
        const q = query(collection(db, "expenses"), orderBy("date", "desc"));
        const querySnapshot = await getDocs(q);
        const expensesList = querySnapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            description: data.description || "",
            amount: data.amount || "",
            date: data.date || "",
            provider: data.provider || "",
            paymentType: data.paymentType || "momento",
          };
        });
        setExpenses(expensesList);
      } catch (error) {
        console.error("Error loading expenses", error);
      } finally {
        setLoading(false);
      }
    };

    loadExpenses();
  }, []);

  const totalExpenses = expenses.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

  const handleSaveExpense = async () => {
    if (!newExpense.description || !newExpense.amount || !newExpense.date) return;

    const expenseToSave = {
      ...newExpense,
      date: newExpense.date, // Guardamos string ISO o local tal cual viene del input
    };

    if (editingExpense) {
      await updateDoc(doc(db, "expenses", editingExpense.id), expenseToSave);
      setExpenses((prev) =>
        prev.map((exp) =>
          exp.id === editingExpense.id ? { ...exp, ...expenseToSave } : exp
        )
      );
    } else {
      const expenseRef = await addDoc(collection(db, "expenses"), expenseToSave);
      setExpenses([{ id: expenseRef.id, ...expenseToSave }, ...expenses]);
    }

    setNewExpense({ description: "", amount: "", date: "", provider: "", paymentType: "momento" });
    setEditingExpense(null);
    setShowAddForm(false);
  };

  const handleDeleteExpense = async (id: string) => {
    await deleteDoc(doc(db, "expenses", id));
    setExpenses((prev) => prev.filter((exp) => exp.id !== id));
    setConfirmDelete(null);
  };

  const openEdit = (expense: Expense) => {
    setEditingExpense(expense);
    setNewExpense({
      description: expense.description,
      amount: expense.amount,
      date: expense.date,
      provider: expense.provider || "",
      paymentType: expense.paymentType || "momento",
    });
    setShowAddForm(true);
  }

  // --- Loading ---
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-muted-foreground animate-pulse">Cargando gastos...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6 lg:p-8 transition-colors duration-300">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border pb-6">
          <div>
            <div className="flex items-center gap-3">
                <h1 id="expenses-page-title" className="text-3xl font-bold text-primary flex items-center gap-3">
                <FaWallet /> Control de Gastos
                </h1>
            <button
              onClick={() => startTutorial('specific')}
              className="flex items-center gap-2 bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/40 px-3 py-1.5 rounded-lg transition-colors font-medium text-sm shadow-sm"
              title="Ver ayuda de inventario"
            >
              <FaQuestion />
              <span>Tutorial</span>
            </button>
            </div>
            <p className="text-muted-foreground mt-1">Registra y administra las salidas de dinero</p>
          </div>

          <div className="flex items-center gap-4">
            <div id="total-expenses-card" className="bg-card border border-border px-5 py-2 rounded-xl text-right shadow-sm">
              <span className="block text-xs text-muted-foreground font-bold uppercase">Total Gastos</span>
              <span className="text-xl font-bold text-red-500">${totalExpenses.toFixed(2)}</span>
            </div>
            <button
              id="btn-add-expense"
              onClick={() => {
                setShowAddForm(true);
                setEditingExpense(null);
                setNewExpense({ description: "", amount: "", date: "", provider: "", paymentType: "momento" });
              }}
              className="bg-primary text-primary-foreground hover:opacity-90 px-4 py-3 rounded-xl font-bold shadow-md flex items-center gap-2 transition-transform hover:scale-105"
            >
              <FaPlus /> <span className="hidden md:inline">Nuevo Gasto</span>
            </button>
          </div>
        </div>

        {/* Formulario (Inline Card) */}
        {showAddForm && (
          <div id="expense-form" className="bg-card border border-border rounded-2xl p-6 shadow-xl animate-fade-in">
            <h3 className="text-xl font-bold text-card-foreground mb-4 flex items-center gap-2">
              {editingExpense ? <FaEdit className="text-primary" /> : <FaPlus className="text-green-500" />}
              {editingExpense ? "Editar Gasto existene" : "Registrar Nuevo Gasto"}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div>
                <label className="text-xs text-muted-foreground font-bold uppercase mb-1 block">Descripción</label>
                <div className="relative">
                  <FaWallet className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Ej: Pago de Luz"
                    value={newExpense.description}
                    onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 bg-input border border-input rounded-xl focus:border-primary outline-none transition-colors text-foreground placeholder:text-muted-foreground"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-bold uppercase mb-1 block">Proveedor</label>
                <div className="relative">
                  <FaQuestion className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Ej: Edesur"
                    value={newExpense.provider}
                    onChange={(e) => setNewExpense({ ...newExpense, provider: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 bg-input border border-input rounded-xl focus:border-primary outline-none transition-colors text-foreground placeholder:text-muted-foreground"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-bold uppercase mb-1 block">Forma de Pago</label>
                <div className="relative">
                  <select
                    value={newExpense.paymentType}
                    onChange={(e) => setNewExpense({ ...newExpense, paymentType: e.target.value })}
                    className="w-full px-4 py-3 bg-input border border-input rounded-xl focus:border-primary outline-none transition-colors text-foreground appearance-none"
                  >
                    <option value="momento">En el momento</option>
                    <option value="contrafactura">A contrafactura</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-bold uppercase mb-1 block">Monto</label>
                <div className="relative">
                  <FaDonate className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="number"
                    placeholder="0.00"
                    value={newExpense.amount}
                    onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 bg-input border border-input rounded-xl focus:border-primary outline-none transition-colors text-foreground placeholder:text-muted-foreground"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-bold uppercase mb-1 block">Fecha</label>
                <div className="relative">
                  <input
                    type="datetime-local"
                    value={newExpense.date}
                    onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
                    className="w-full px-4 py-3 bg-input border border-input rounded-xl focus:border-primary outline-none transition-colors text-foreground"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-border pt-4">
              <button
                onClick={() => setShowAddForm(false)}
                className="px-6 py-2 rounded-lg font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveExpense}
                className="bg-primary text-primary-foreground hover:opacity-90 px-6 py-2 rounded-lg font-bold shadow-md transition-transform active:scale-95 flex items-center gap-2"
              >
                <FaSave /> Guardar
              </button>
            </div>
          </div>
        )}

        {/* Lista de gastos */}
        <div id="expenses-list" className="space-y-4">
          {expenses.length === 0 && (
            <div className="text-center py-10 border border-dashed border-border rounded-2xl">
              <p className="text-muted-foreground">No hay gastos registrados.</p>
            </div>
          )}

          {expenses.map((expense, i) => (
            <div
              key={expense.id}
              id={i === 0 ? "first-expense-item" : undefined}
              className="group bg-card border border-border p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:border-primary/50 transition-all shadow-sm"
            >
              <div className="flex items-center gap-4 flex-1">
                <div className="p-3 bg-secondary rounded-xl text-red-500 group-hover:bg-red-500 group-hover:text-white transition-colors">
                  <FaMoneyBillWave size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-lg text-card-foreground leading-tight">{expense.description}</h4>
                  <div className="flex flex-col gap-1 text-sm text-muted-foreground mt-1">
                    <div className="flex items-center gap-2">
                        <FaCalendarAlt size={12} />
                        {expense.date ? new Date(expense.date).toLocaleString() : "Sin fecha"}
                    </div>
                    {expense.provider && (
                        <div className="flex items-center gap-2">
                            <span className="font-semibold">Prov:</span> {expense.provider}
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${expense.paymentType === 'contrafactura' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                            {expense.paymentType === 'contrafactura' ? 'A Contrafactura' : 'En el Momento'}
                        </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
                <div className="text-right">
                  <p className="text-xs text-muted-foreground font-bold uppercase">Monto</p>
                  <span className="text-xl font-bold text-card-foreground block">
                    ${parseFloat(expense.amount).toFixed(2)}
                  </span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => openEdit(expense)}
                    className="p-2 text-muted-foreground hover:text-primary hover:bg-secondary rounded-lg transition-colors"
                    title="Editar"
                  >
                    <FaEdit size={18} />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(expense.id)}
                    className="p-2 text-muted-foreground hover:text-red-500 hover:bg-secondary rounded-lg transition-colors"
                    title="Eliminar"
                  >
                    <FaTrash size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Modal confirmación */}
        {confirmDelete && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-card border border-border p-6 rounded-2xl max-w-sm w-full shadow-2xl animate-scale-up">
              <h2 className="text-xl font-bold mb-2 text-card-foreground flex items-center gap-2">
                <FaTrash className="text-red-500" /> Eliminar Gasto
              </h2>
              <p className="text-muted-foreground mb-6">¿Estás seguro de que quieres eliminar este registro? Esta acción no se puede deshacer.</p>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="px-4 py-2 rounded-lg font-bold text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => confirmDelete && handleDeleteExpense(confirmDelete)}
                  className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg text-white font-bold shadow-md"
                >
                  Sí, Eliminar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExpensesTable;
