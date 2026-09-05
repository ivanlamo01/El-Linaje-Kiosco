export function normalizeCategoryKey(name: string): string {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es");
}

export function formatCategoryName(name: string): string {
  const compact = String(name || "").trim().replace(/\s+/g, " ");
  if (!compact) return "";
  return compact.charAt(0).toUpperCase() + compact.slice(1);
}
