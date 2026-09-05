"use client";

import { useState, FormEvent, useEffect } from "react";
import { useAuthContext } from "../Context/AuthContext";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { FirebaseError } from "firebase/app";
import { auth, db } from "../config/firebase";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { getByEmail } from "../lib/services/usuariosServices";
import { sendPasswordReset } from "../lib/services/usuariosServices";

function Login() {
  const { handleLogin, handleGoogleLogin, login } = useAuthContext(); 
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const router = useRouter();


  useEffect(() => {
    if (login) {
      router.push("/");
    }
  }, [login, router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isRegistering) {
        // --- LOGICA DE REGISTRO ---
        // Verificar si ya existe un usuario con este email
        const existingUsers = await getByEmail(email);
        
        if (existingUsers.length > 0) {
          setError("Ya existe una cuenta con este email. Por favor, inicia sesión.");
          setLoading(false);
          return;
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Actualizar perfil básico (displayName)
        await updateProfile(user, { displayName: name });

        // Crear documento en Firestore
        await setDoc(doc(db, "Usuarios", user.uid), {
          userId: user.uid,
          nombre: name,
          email: email,
          rol: "user",
          createdAt: new Date().toISOString(),
          lastLogin: new Date()
        });
        
        // El login es automático tras crearse el usuario,
        // AuthContext detectará el cambio de estado con onAuthStateChanged.
      } else {
        // --- LOGICA DE LOGIN ---
        try {
          await handleLogin(email, password);
        } catch (loginErr: unknown) {
          const error = loginErr as FirebaseError;
          // Si el error es invalid-credential, verificar si existe un usuario con ese email
          if (error?.code === 'auth/invalid-credential') {
            const existingUsers = await getByEmail(email);
            if (existingUsers.length > 0) {
              setError("Esta cuenta fue registrada con Google. Por favor, usa 'Iniciar con Google' o establece una contraseña.");
            } else {
              setError("Email o contraseña inválidos");
            }
          } else {
            throw loginErr;
          }
        }
      }
    } catch (err: unknown) {
      console.error(err);
      setError(
        isRegistering 
          ? "Error al registrarse. Verifique los datos." 
          : "Email o contraseña inválidos"
      );
    } finally {
      setLoading(false);
    }
  };

  const onGoogleLogin = async () => {
    try {
      await handleGoogleLogin();
    } catch  {
      setError("Error al iniciar sesión con Google");
    }
  };

  const onPasswordReset = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResetMessage(null);
    setError(null);

    try {
      await sendPasswordReset(resetEmail);
      setResetMessage("Si el email existe, Firebase envió el link de recuperación. Revisá bandeja principal, spam y promociones.");
      setResetEmail("");
      setTimeout(() => {
        setShowResetPassword(false);
        setResetMessage(null);
      }, 3000);
    } catch (err: unknown) {
      const firebaseError = err as FirebaseError;
      const byCode: Record<string, string> = {
        "auth/invalid-email": "El email no es válido.",
        "auth/user-not-found": "No existe una cuenta con ese email.",
        "auth/too-many-requests": "Demasiados intentos. Esperá unos minutos e intentá otra vez.",
        "auth/network-request-failed": "Error de red. Revisá tu conexión e intentá nuevamente.",
      };
      const code = firebaseError?.code || "";
      setError(byCode[code] || `No se pudo enviar el email (${code || "error desconocido"}).`);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="bg-[#1a1a1a] p-8 rounded-xl shadow-lg w-full max-w-sm transition-all duration-300">
        <h2 className="text-center text-2xl font-bold text-yellow-500 mb-6">
          {showResetPassword ? "Recuperar Contraseña" : (isRegistering ? "Crear Cuenta" : "Iniciar sesión")}
        </h2>

        {showResetPassword ? (
          // Formulario de recuperación de contraseña
          <form onSubmit={onPasswordReset} className="space-y-4">
            <input
              type="email"
              placeholder="Ingresa tu email"
              className="w-full px-4 py-2 rounded-md bg-[#333] text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              required
            />

            {error && (
              <div className="bg-red-500/20 border border-red-500 text-red-300 text-sm p-3 rounded-md">
                {error}
              </div>
            )}

            {resetMessage && (
              <div className="bg-green-500/20 border border-green-500 text-green-300 text-sm p-3 rounded-md">
                {resetMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-yellow-500 hover:bg-yellow-600 text-black font-bold rounded-md transition disabled:opacity-50"
            >
              {loading ? "Enviando..." : "Enviar email de recuperación"}
            </button>

            <button
              type="button"
              onClick={() => {
                setShowResetPassword(false);
                setError(null);
                setResetMessage(null);
              }}
              className="w-full py-2 text-yellow-500 hover:text-yellow-400 text-sm transition"
            >
              Volver al inicio de sesión
            </button>
          </form>
        ) : (
          <>
            <form onSubmit={onSubmit} className="space-y-4">
              {isRegistering && (
                <input
                  type="text"
                  placeholder="Nombre Completo"
                  className="w-full px-4 py-2 rounded-md bg-[#333] text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500 animate-fade-in"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              )}
              
              <input
                type="email"
                placeholder="Email"
                className="w-full px-4 py-2 rounded-md bg-[#333] text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                type="password"
                placeholder="Contraseña"
                className="w-full px-4 py-2 rounded-md bg-[#333] text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />

              {error && (
                <div className="bg-red-500/20 border border-red-500 text-red-300 text-sm p-3 rounded-md">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-yellow-500 hover:bg-yellow-600 text-black font-bold rounded-md transition disabled:opacity-50"
              >
                {loading ? "Procesando..." : (isRegistering ? "Registrarse" : "Iniciar sesión")}
              </button>
            </form>

            <div className="mt-4 space-y-2">
              <div className="text-center">
                <button 
                  type="button"
                  onClick={() => {
                    setIsRegistering(!isRegistering);
                    setError(null);
                  }}
                  className="text-sm text-yellow-500 hover:text-yellow-400 hover:underline transition-colors focus:outline-none"
                >
                  {isRegistering 
                    ? "¿Ya tenés cuenta? Iniciar Sesión" 
                    : "¿No tenés cuenta? Registrarse"}
                </button>
              </div>

              {!isRegistering && (
                <div className="text-center">
                  <button 
                    type="button"
                    onClick={() => {
                      setShowResetPassword(true);
                      setError(null);
                    }}
                    className="text-sm text-yellow-500 hover:text-yellow-400 hover:underline transition-colors focus:outline-none"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center my-4">
              <div className="flex-grow h-px bg-gray-700"></div>
              <span className="px-2 text-gray-400 text-sm">o</span>
              <div className="flex-grow h-px bg-gray-700"></div>
            </div>

            <button
              onClick={onGoogleLogin}
              className="w-full py-3 bg-white text-black font-medium rounded-md flex items-center justify-center gap-2 hover:bg-gray-200 transition"
            >
              <Image
                width={20}
                height={20}
                src="https://www.svgrepo.com/show/355037/google.svg"
                alt="google"
                className="w-5 h-5"
              />
              Iniciar con Google
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default Login;
