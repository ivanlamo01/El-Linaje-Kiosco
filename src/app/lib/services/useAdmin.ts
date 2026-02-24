"use client";

import { useAuthContext } from "../../Context/AuthContext";

export function useAdmin() {
  const { user } = useAuthContext();

  return {
    isAdmin: Boolean(user?.isAdmin),
    loading: false,
  };
}
