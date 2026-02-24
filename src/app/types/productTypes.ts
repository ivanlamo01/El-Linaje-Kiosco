
type PromoProduct = {
  barcode: string;
  quantity: number;
};
export interface ProductoData {
  id: string;
  title: string;
  price: number;
  Barcode: string;
  category: string;
  stock: number;
  variablePrice?: boolean;
  description?: string;
  products?: PromoProduct[];
  isPromo?: boolean;
  title_normalized?: string;
  category_normalized?: string
  categoryName?: string; // nombre
  dateAdded?: Date | { seconds: number; nanoseconds: number } | string | number;
  [key: string]: unknown;
}

export interface ProductoProps extends ProductoData {
  onEdit?: () => void; // 👈 evento opcional para el botón Editar
  onDelete?: () => void; // 👈 evento opcional para el botón Borrar
  onSelect?: (checked: boolean) => void;
  isSelected?: boolean;
}


export type Product = {
  id: string;
  data: ProductoData;
};