import { auth, db } from "../../config/firebase";
import {
  signInWithEmailAndPassword,
  signOut,
  UserCredential,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail
} from "firebase/auth";
import { collection, query, where, getDocs } from "firebase/firestore";
import type { Usuario } from "../../types/authTypes";
// 🔹 Modelo de usuario (ajusta campos según tu colección)

// 🔹 Obtener usuario por ID (colección Firestore)
export async function getByUserId(userId: string): Promise<Usuario[]> {
  const usuariosRef = collection(db, "Usuarios");
  const q = query(usuariosRef, where("userId", "==", userId));
  const querySnapshot = await getDocs(q);

  return querySnapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<Usuario, "id">),
  }));
}

// 🔹 Obtener usuario por email
export async function getByEmail(email: string): Promise<Usuario[]> {
  const usuariosRef = collection(db, "Usuarios");
  const q = query(usuariosRef, where("email", "==", email.toLowerCase()));
  const querySnapshot = await getDocs(q);

  return querySnapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<Usuario, "id">),
  }));
}

// 🔹 Login con Firebase Auth (email/password)
export async function loginUser(email: string, password: string): Promise<UserCredential> {
  return await signInWithEmailAndPassword(auth, email, password);
}

import { Capacitor } from "@capacitor/core";
import { GoogleAuth } from "@codetrix-studio/capacitor-google-auth";
import { isElectron, getElectronAPI } from "../utils/environment";
import { doc, updateDoc } from "firebase/firestore";

// 🔹 Login con Google (Híbrido: Web vs Native vs Electron)
export async function loginWithGoogle(): Promise<UserCredential> {
  if (isElectron()) {
    // 🖥️ Electron: Usar proceso Main para OAuth Popup
    const electron = getElectronAPI();
    if (electron && electron.auth) {
        try {
            const idToken = await (electron.auth as { signInWithGoogle: () => Promise<string> }).signInWithGoogle();
            const credential = GoogleAuthProvider.credential(idToken);
            return await import("firebase/auth").then(({ signInWithCredential }) =>
                signInWithCredential(auth, credential)
            );
        } catch (error) {
            console.error("Electron Google Login Error:", error);
            throw error;
        }
    }
    throw new Error("Electron API not found");
  } else if (Capacitor.isNativePlatform()) {
    // 📲 Native: Usar Plugin
    const googleUser = await GoogleAuth.signIn();
    const idToken = googleUser.authentication.idToken;
    const credential = GoogleAuthProvider.credential(idToken);
    return await import("firebase/auth").then(({ signInWithCredential }) =>
      signInWithCredential(auth, credential)
    );
  } else {
    // 💻 Web: Usar Popup estándar
    const provider = new GoogleAuthProvider();
    return await signInWithPopup(auth, provider);
  }
}

// 🔹 Logout con Firebase Auth
export async function logoutUser(): Promise<void> {
  return await signOut(auth);
}

// 🔹 Establecer contraseña para cuenta existente (ej: cuenta Google)
export async function setPasswordForUser(newPassword: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("No hay usuario autenticado");
  }
  
  const { updatePassword } = await import("firebase/auth");
  await updatePassword(user, newPassword);
}

// 🔹 Enviar email de recuperación de contraseña
export async function sendPasswordReset(email: string): Promise<void> {
  // Usa la plantilla/URL de acción configurada en Firebase Console.
  await sendPasswordResetEmail(auth, email.trim().toLowerCase());
}
