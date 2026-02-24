export interface LoginFormData {
  email: string;
  password: string;
}

export interface AlertState {
  variant: "success" | "danger" | "warning" | "info";
  text: string;
  duration?: number;
  link?: string;
}
