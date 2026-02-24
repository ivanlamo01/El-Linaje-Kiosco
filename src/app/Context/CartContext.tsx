"use client";

import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
} from "react";
import { v4 as uuidv4 } from "uuid";
import { ProductoData } from "../types/productTypes";

export interface CartItem {
  id: string;
  data: ProductoData;
  quantity: number;
  customPrice?: number;
  customDescription?: string;
}

interface CartContextType {
  cart: CartItem[];
  addToCart: (
    product: { id: string; data: ProductoData },
    customPrice?: number | null,
    customDescription?: string,
    forceUnique?: boolean
  ) => void;
  removeFromCart: (id: string) => void;
  updateCartQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const useCart = (): CartContextType => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart debe usarse dentro de un CartProvider");
  }
  return context;
};

export const CartProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [cart, setCart] = useState<CartItem[]>([]);

  const addToCart = (
    product: { id: string; data: ProductoData },
    customPrice: number | null = null,
    customDescription: string = "",
    forceUnique: boolean = false
  ) => {
    setCart((prevCart) => {
      // Si es una categoría que requiere items únicos (ej: Almacen o Peso con forceUnique)
      if (product.data.category === "Almacen" || forceUnique) {
        // Generar un identificador único
        const uniqueId = uuidv4();
        return [
          ...prevCart,
          {
            ...product,
            id: `${product.id}-${uniqueId}`,
            quantity: 1,
            customPrice: customPrice ?? product.data.price,
            customDescription:
              customDescription || product.data.description,
          },
        ];
      } else {
        const existingProduct = prevCart.find(
          (item) => item.id === product.id
        );
        if (existingProduct) {
          return prevCart.map((item) =>
            item.id === product.id
              ? { ...item, quantity: item.quantity + 1 }
              : item
          );
        } else {
          return [
            ...prevCart,
            {
              ...product,
              quantity: 1,
              customPrice: customPrice ?? product.data.price,
              customDescription:
                customDescription || product.data.description,
            },
          ];
        }
      }
    });
  };

  const removeFromCart = (uniqueId: string) => {
    setCart((prevCart) => prevCart.filter((item) => item.id !== uniqueId));
  };

  const updateCartQuantity = (id: string, quantity: number) => {
    setCart((prevCart) =>
      prevCart.map((item) =>
        item.id === id ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = () => setCart([]);

  return (
    <CartContext.Provider
      value={{ cart, addToCart, removeFromCart, updateCartQuantity, clearCart }}
    >
      {children}
    </CartContext.Provider>
  );
};
