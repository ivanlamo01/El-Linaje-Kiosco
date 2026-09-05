export const LOW_STOCK_THRESHOLD = 5;

export interface StockDeductionResult {
  quantityToDeduct: number;
  newStock: number;
  isLowStock: boolean;
}

export function extractGramsFromDescription(description?: string): number | null {
  // Cubre ambos formatos que produce el carrito: gramos ("250g", pesos < 1kg)
  // y kilogramos ("1.500kg", pesos >= 1kg en el escaneo por código de barras).
  const match = description?.match(/(\d+(?:\.\d+)?)\s*(kg|g)\b/i);
  if (!match) return null;

  const value = parseFloat(match[1]);
  return match[2].toLowerCase() === "kg" ? value * 1000 : value;
}

export function normalizeCategoryName(raw: string): string {
  return String(raw || "").trim().toLowerCase();
}

export function calculateStockDeduction(input: {
  currentStock: number;
  quantity: number;
  isWeighted: boolean;
  customDescription?: string;
}): StockDeductionResult {
  let quantityToDeduct = input.quantity;

  if (input.isWeighted) {
    const grams = extractGramsFromDescription(input.customDescription);
    if (grams !== null) {
      quantityToDeduct = grams * input.quantity;
    }
  }

  const newStock = input.currentStock - quantityToDeduct;

  return {
    quantityToDeduct,
    newStock,
    isLowStock: newStock <= LOW_STOCK_THRESHOLD,
  };
}

export function calculatePromoComponentDeduction(input: {
  currentStock: number;
  promoQuantityPerUnit: number;
  cartQuantity: number;
}): StockDeductionResult {
  const quantityToDeduct = input.promoQuantityPerUnit * input.cartQuantity;
  const newStock = input.currentStock - quantityToDeduct;

  return {
    quantityToDeduct,
    newStock,
    isLowStock: newStock <= LOW_STOCK_THRESHOLD,
  };
}
