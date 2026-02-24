export const formatCurrency = (value: number) => {
  const safeValue = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(safeValue);
};
