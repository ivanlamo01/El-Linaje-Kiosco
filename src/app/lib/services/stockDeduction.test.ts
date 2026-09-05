import { describe, it, expect } from "vitest";
import {
  calculateStockDeduction,
  calculatePromoComponentDeduction,
  extractGramsFromDescription,
  normalizeCategoryName,
  LOW_STOCK_THRESHOLD,
} from "./stockDeduction";

describe("normalizeCategoryName", () => {
  it("normaliza mayúsculas y espacios (el bug de 'Peso' vs 'peso')", () => {
    expect(normalizeCategoryName(" Peso ")).toBe("peso");
    expect(normalizeCategoryName("PESO")).toBe("peso");
  });

  it("maneja valores vacíos o undefined", () => {
    expect(normalizeCategoryName("")).toBe("");
    expect(normalizeCategoryName(undefined as unknown as string)).toBe("");
  });
});

describe("extractGramsFromDescription", () => {
  it("extrae los gramos de un patrón '250g'", () => {
    expect(extractGramsFromDescription("Jamón (250g)")).toBe(250);
  });

  it("extrae gramos decimales", () => {
    expect(extractGramsFromDescription("Queso 100.5g")).toBe(100.5);
  });

  it("convierte kilogramos a gramos (formato que usa el escaneo por código de barras para pesos >= 1kg)", () => {
    expect(extractGramsFromDescription("Jamón (1.500kg)")).toBe(1500);
    expect(extractGramsFromDescription("Queso (2kg)")).toBe(2000);
  });

  it("devuelve null si no hay patrón de gramos ni kilogramos", () => {
    expect(extractGramsFromDescription("Sin peso especificado")).toBeNull();
    expect(extractGramsFromDescription(undefined)).toBeNull();
  });
});

describe("calculateStockDeduction", () => {
  it("deduce la cantidad del carrito para productos no pesables", () => {
    const result = calculateStockDeduction({
      currentStock: 10,
      quantity: 3,
      isWeighted: false,
    });
    expect(result).toEqual({ quantityToDeduct: 3, newStock: 7, isLowStock: false });
  });

  it("para categoría peso, deduce gramos * cantidad cuando la descripción trae el patrón", () => {
    const result = calculateStockDeduction({
      currentStock: 1000,
      quantity: 1,
      isWeighted: true,
      customDescription: "Jamón cocido 250g",
    });
    expect(result.quantityToDeduct).toBe(250);
    expect(result.newStock).toBe(750);
  });

  it("para categoría peso sin patrón de gramos, cae a la cantidad del carrito", () => {
    const result = calculateStockDeduction({
      currentStock: 100,
      quantity: 1,
      isWeighted: true,
      customDescription: "Sin gramos en la descripción",
    });
    expect(result.quantityToDeduct).toBe(1);
    expect(result.newStock).toBe(99);
  });

  it("para categoría peso con descripción en kg (escaneo de código de barras >= 1kg), deduce en gramos", () => {
    const result = calculateStockDeduction({
      currentStock: 5000,
      quantity: 1,
      isWeighted: true,
      customDescription: "Jamón cocido (1.500kg)",
    });
    expect(result.quantityToDeduct).toBe(1500);
    expect(result.newStock).toBe(3500);
  });

  it(`marca stock bajo cuando newStock <= ${LOW_STOCK_THRESHOLD}`, () => {
    expect(calculateStockDeduction({ currentStock: 6, quantity: 1, isWeighted: false }).isLowStock).toBe(true);
    expect(calculateStockDeduction({ currentStock: 7, quantity: 1, isWeighted: false }).isLowStock).toBe(false);
  });

  it("permite stock negativo (la venta no se bloquea) y lo marca como stock bajo", () => {
    const result = calculateStockDeduction({ currentStock: 2, quantity: 5, isWeighted: false });
    expect(result.newStock).toBe(-3);
    expect(result.isLowStock).toBe(true);
  });
});

describe("calculatePromoComponentDeduction", () => {
  it("multiplica la cantidad del componente de la promo por la cantidad vendida", () => {
    const result = calculatePromoComponentDeduction({
      currentStock: 50,
      promoQuantityPerUnit: 2,
      cartQuantity: 3,
    });
    expect(result).toEqual({ quantityToDeduct: 6, newStock: 44, isLowStock: false });
  });

  it("marca stock bajo según el mismo umbral", () => {
    const result = calculatePromoComponentDeduction({
      currentStock: 8,
      promoQuantityPerUnit: 1,
      cartQuantity: 3,
    });
    expect(result.newStock).toBe(5);
    expect(result.isLowStock).toBe(true);
  });
});
