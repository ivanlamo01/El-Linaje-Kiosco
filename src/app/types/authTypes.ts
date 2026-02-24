import type { User } from "firebase/auth";

export interface AuthContextType {
  login: boolean;
  handleLogout: () => void;
  user: User | null; 
}

export interface Permissions {
  inventario?: boolean;
  cart?: boolean;
  debtors?: boolean;
  users?: boolean;
  sales?: boolean;
  facturacion?: boolean;
  facturas?: boolean;
  expenses?: boolean;
  graficos?: boolean;
}

export interface Usuario {
  id: string;
  isAdmin?: boolean;
  userId: string;
  nombre: string;
  email: string;
  tasks?: { id: string; description: string; deadline: string }[];
  permissions?: Permissions;
}
