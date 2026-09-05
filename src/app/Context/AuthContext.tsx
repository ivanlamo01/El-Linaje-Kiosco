"use client";

import { createContext, useContext, useState, useEffect } from "react";
import {
  loginUser,
  logoutUser,
  getByUserId,
  loginWithGoogle,
  getByEmail,
} from "../lib/services/usuariosServices";
import { auth, db } from "../config/firebase";
import { onAuthStateChanged, getIdTokenResult } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore"; // 👈 Added setDoc
import type { Usuario } from "../types/authTypes";

interface AuthContextType {
  login: boolean;
  user: Usuario | null;
  loading: boolean;
  handleLogin: (email: string, password: string) => Promise<void>;
  handleGoogleLogin: () => Promise<void>;
  handleLogout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [login, setLogin] = useState(false);
  const [user, setUser] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // 1. Traer claims
        const token = await getIdTokenResult(firebaseUser);
        const isAdminClaim = token.claims.isAdmin === true;

        // 2. Traer Firestore con manejo de error (offline/permisos)
        let data: Partial<Usuario> = {};
        try {
          const userRef = doc(db, "Usuarios", firebaseUser.uid);
          const snap = await getDoc(userRef);
          data = snap.exists() ? (snap.data() as Partial<Usuario>) : {};
        } catch (error) {
          console.warn("Firestore error in AuthContext:", error);
        }

        // 3. Traer desde tu servicio
        let usuarios: Usuario[] = [];
        try {
          usuarios = await getByUserId(firebaseUser.uid);
        } catch(e) {
          console.warn("Firestore error querying user by ID:", e);
        }
        
        const baseUser: Usuario = usuarios.length > 0
          ? usuarios[0]
          : {
            id: firebaseUser.uid,
            userId: firebaseUser.uid,
            nombre: firebaseUser.displayName || "Usuario sin nombre",
            email: firebaseUser.email || "",
            isAdmin: false,
          };

        // 4. Fusionar y tipar bien
        const mergedUser: Usuario = {
          ...baseUser,
          ...data,
          isAdmin: isAdminClaim || data.isAdmin === true || baseUser.isAdmin,
        };

        setUser(mergedUser);
        setLogin(true);
      } else {
        setUser(null);
        setLogin(false);
      }
      setLoading(false);
    });



    // Inicializar Google Auth (Solo si es necesario para web/hybrid)
    import("@codetrix-studio/capacitor-google-auth").then(({ GoogleAuth }) => {
      GoogleAuth.initialize({
        clientId: '89554017780-dsejb9g4uc2bbot1advdbq52cht6eu70.apps.googleusercontent.com',
        scopes: ['profile', 'email'],
        grantOfflineAccess: true,
      }); 
    }).catch(err => console.warn("Google Auth failed to load (likely not hybrid environment):", err));

    return () => unsubscribe();
  }, []);

  const handleLogin = async (email: string, password: string) => {
    const cred = await loginUser(email, password);
    if (cred.user.uid) {
      await cred.user.getIdToken(true);
      const usuarios = await getByUserId(cred.user.uid);
      if (usuarios.length > 0) {
        setUser(usuarios[0]);
        setLogin(true);
      }
    }
  };

  const handleGoogleLogin = async () => {
    const cred = await loginWithGoogle();
    if (cred.user.uid && cred.user.email) {
      await cred.user.getIdToken(true);
      
      let existingUsers: Usuario[] = [];
      try {
        existingUsers = await getByEmail(cred.user.email);
      } catch (e) {
        console.warn("No se pudo buscar por email (permisos insuficientes):", e);
      }
      
      if (existingUsers.length > 0) {
        // Ya existe un usuario con este email, usar su información
        const existingUser = existingUsers[0];
        setUser(existingUser);
        setLogin(true);
        
        // Actualizar lastLogin en Firestore
        try {
          await setDoc(doc(db, "Usuarios", existingUser.id), {
            ...existingUser,
            lastLogin: new Date()
          }, { merge: true });
        } catch(e) {
          console.warn("No se pudo actualizar lastLogin", e);
        }
      } else {
        // No existe, verificar si existe por userId (login previo con Google)
        let usuarios: Usuario[] = [];
        try {
          usuarios = await getByUserId(cred.user.uid);
        } catch (e) {
          console.warn("No se pudo buscar por userId", e);
        }

        if (usuarios.length > 0) {
          setUser(usuarios[0]);
          setLogin(true);

          // Actualizar lastLogin
          try {
            await setDoc(doc(db, "Usuarios", usuarios[0].id), {
              lastLogin: new Date()
            }, { merge: true });
          } catch(e) {
            console.warn("No se pudo actualizar lastLogin", e);
          }
        } else {
          // Usuario completamente nuevo
          const newUser: Usuario = {
            id: cred.user.uid,
            userId: cred.user.uid,
            nombre: cred.user.displayName || "Usuario sin nombre",
            email: cred.user.email,
            isAdmin: false,
          };

          // Guardar en Firestore con la estructura correcta
          try {
            await setDoc(doc(db, "Usuarios", cred.user.uid), {
              userId: newUser.userId,
              nombre: newUser.nombre,
              email: newUser.email,
              isAdmin: newUser.isAdmin,
              createdAt: new Date(),
              lastLogin: new Date()
            });
          } catch(e) {
            console.warn("No se pudo guardar el nuevo usuario en Firestore", e);
          }

          setUser(newUser);
          setLogin(true);
        }
      }
    }
  };

  const handleLogout = async () => {
    await logoutUser();
    setUser(null);
    setLogin(false);
  };

  return (
    <AuthContext.Provider value={{ login, user, loading, handleLogin, handleGoogleLogin, handleLogout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext debe usarse dentro de AuthProvider");
  return ctx;
};
