"use client";
import React from "react";
import { useAuthContext } from "../Context/AuthContext";
import { ProductoProps } from "../types/productTypes";
import { FaTrash } from "react-icons/fa";

const Producto: React.FC<ProductoProps> = ({
  title,
  price,
  Barcode,
  categoryName,
  stock,
  onEdit,
  onDelete,
  isSelected,
  onSelect,
}) => {
  const { login } = useAuthContext();

  return (
    <tr
      className={`${stock <= 0
        ? "bg-muted/50 text-muted-foreground"
        : "text-foreground hover:bg-muted/30 transition-colors"
        } border-b border-border ${isSelected ? "bg-primary/10" : ""}`}
    >
      <td className="p-4 text-center">
        {login && (
          <input
            type="checkbox"
            checked={isSelected || false}
            onChange={(e) => onSelect?.(e.target.checked)}
            className="w-5 h-5 rounded border-input bg-input text-primary focus:ring-primary cursor-pointer"
          />
        )}
      </td>
      <td className="p-4">{Barcode}</td>
      <td className="p-4 font-medium">{title}</td>
      <td className="p-4">${price}</td>
      <td className="p-4">{categoryName ?? "Sin categoría"}</td>
      <td className="p-4 text-center">
        <span className={`${stock <= 5 ? "text-destructive font-bold" : "text-foreground"}`}>
          {stock}
        </span>
      </td>
      <td className="p-4 text-right">
        {login && (
          <div className="flex justify-end gap-2">
            <button
              onClick={onEdit}
              className="bg-secondary hover:bg-secondary/80 text-secondary-foreground px-4 py-2 rounded-lg font-bold text-sm transition-all shadow-sm border border-border"
            >
              Editar
            </button>
            <button
              onClick={() => onDelete?.()}
              className="bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20 px-3 py-2 rounded-lg transition-all shadow-sm flex items-center justify-center"
              title="Eliminar producto"
            >
              <FaTrash size={14} />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
};
export default Producto;