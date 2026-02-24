"use client"
import React, { useState } from "react";
import { db } from "../config/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { ProductoProps } from "../types/productTypes";

interface Props extends ProductoProps {
  onClose: () => void;
}

const ProductoModal: React.FC<Props> = ({
  id,
  title,
  price,
  Barcode,
  category,
  stock,
  variablePrice,
  onClose,
}) => {
  const [formData, setFormData] = useState({
    title,
    price,
    Barcode,
    category,
    stock,
    variablePrice: variablePrice || false,
  });
  const [saving, setSaving] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : name === "price" || name === "stock" ? Number(value) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const ref = doc(db, "Productos", id);
      await updateDoc(ref, formData);
      onClose(); // cerrar modal
    } catch (err) {
      console.error("Error al actualizar:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-zinc-900 p-6 rounded-2xl shadow-lg w-full max-w-md">
        <h2 className="text-xl font-bold mb-4 text-yellow-500">Editar Producto</h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            name="title"
            value={formData.title}
            onChange={handleChange}
            placeholder="Nombre"
            className="w-full px-3 py-2 rounded bg-black border border-gray-700 text-white"
          />
          <input
            type="number"
            name="price"
            value={formData.price}
            onChange={handleChange}
            placeholder="Precio"
            className="w-full px-3 py-2 rounded bg-black border border-gray-700 text-white"
          />
          <input
            type="text"
            name="Barcode"
            value={formData.Barcode}
            onChange={handleChange}
            placeholder="Código de barras"
            className="w-full px-3 py-2 rounded bg-black border border-gray-700 text-white"
          />
          <input
            type="text"
            name="category"
            value={formData.category}
            onChange={handleChange}
            placeholder="Categoría"
            className="w-full px-3 py-2 rounded bg-black border border-gray-700 text-white"
          />
          <input
            type="number"
            name="stock"
            value={formData.stock}
            onChange={handleChange}
            placeholder="Stock"
            className="w-full px-3 py-2 rounded bg-black border border-gray-700 text-white"
          />

          <label className="flex items-center gap-2 text-gray-300">
            <input
              type="checkbox"
              name="variablePrice"
              checked={formData.variablePrice}
              onChange={handleChange}
            />
            Precio variable
          </label>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded bg-yellow-500 hover:bg-yellow-600 text-black font-bold disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProductoModal;
