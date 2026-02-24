"use client";

import { useState, FormEvent, useEffect } from "react";
import { useAuthContext } from "../Context/AuthContext";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { auth, db } from "../config/firebase";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";

function Login() {
  const { handleLogin, handleGoogleLogin, login } = useAuthContext(); 
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
          createdAt: new Date().toISOString()
        });
        
        // El login es automático tras crearse el usuario,
        // AuthContext detectará el cambio de estado con onAuthStateChanged.
      } else {
        // --- LOGICA DE LOGIN ---
        await handleLogin(email, password);
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
  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="bg-[#1a1a1a] p-8 rounded-xl shadow-lg w-full max-w-sm transition-all duration-300">
        <h2 className="text-center text-2xl font-bold text-yellow-500 mb-6">
          {isRegistering ? "Crear Cuenta" : "Iniciar sesión"}
        </h2>

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

          {error && <p className="text-red-500 text-sm italic">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-yellow-500 hover:bg-yellow-600 text-black font-bold rounded-md transition disabled:opacity-50"
          >
            {loading ? "Procesando..." : (isRegistering ? "Registrarse" : "Iniciar sesión")}
          </button>
        </form>

        <div className="mt-4 text-center">
            <button 
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
      </div>
    </div>
  );
}

export default Login;
