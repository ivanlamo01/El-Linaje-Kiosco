"use client";

import React, { useState, useEffect } from "react";
import { useAuthContext } from "../Context/AuthContext";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import { updateProfile, updatePassword } from "firebase/auth";
import { auth } from "../config/firebase";
import CustomAlert, { AlertType } from "../Components/CustomAlert";
import { FaUserCircle, FaSave, FaEnvelope, FaUser, FaLock, FaKey } from "react-icons/fa";

export default function ProfilePage() {
    const { user } = useAuthContext();
    const [name, setName] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    
    // Alert State
    const [alert, setAlert] = useState<{ isOpen: boolean; title: string; message: string; type: AlertType }>({
        isOpen: false, title: "", message: "", type: "info"
    });

    useEffect(() => {
        if (user?.nombre) setName(user.nombre);
    }, [user]);

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (!auth.currentUser) throw new Error("No hay sesión activa");

            // Validar contraseñas si se ingresaron
            if (password || confirmPassword) {
                if (password !== confirmPassword) {
                    throw new Error("Las contraseñas no coinciden");
                }
                if (password.length < 6) {
                    throw new Error("La contraseña debe tener al menos 6 caracteres");
                }
                // Actualizar contraseña en Firebase Auth
                await updatePassword(auth.currentUser, password);
            }

            // 1. Update Auth Profile
            if (name !== user?.nombre) {
                await updateProfile(auth.currentUser, {
                    displayName: name
                });
            }

            // 2. Update Firestore
            if (user?.id) {
                await updateDoc(doc(db, "Usuarios", user.id), {
                    nombre: name
                });
            }

            setAlert({
                isOpen: true,
                title: "Éxito",
                message: password ? "Perfil y contraseña actualizados correctamente." : "Perfil actualizado correctamente.",
                type: "success"
            });
            
            // Limpiar campos de contraseña
            setPassword("");
            setConfirmPassword("");

        } catch (err: unknown) {
            const error = err as { code?: string; message?: string };
            // Manejo específico para re-autenticación requerida
            if (error.code === 'auth/requires-recent-login') {
                setAlert({
                    isOpen: true,
                    title: "Seguridad",
                    message: "Para cambiar la contraseña debes haber iniciado sesión recientemente. Por favor, cerrá sesión y volvé a entrar.",
                    type: "warning"
                });
            } else {
                setAlert({
                    isOpen: true,
                    title: "Error",
                    message: error.message || "Error al actualizar perfil",
                    type: "error"
                });
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background p-6 lg:p-10 flex flex-col items-center">
             <div className="w-full max-w-2xl animate-fade-in">
                <h1 className="text-3xl font-bold text-primary mb-2">Mi Perfil</h1>
                <p className="text-muted-foreground mb-8">Administra tu información personal</p>

                <div className="bg-card border border-border rounded-2xl shadow-lg overflow-hidden">
                    <div className="bg-secondary/30 p-8 flex flex-col items-center justify-center border-b border-border">
                        <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4 text-5xl">
                            <FaUserCircle />
                        </div>
                        <h2 className="text-xl font-bold">{user?.nombre || "Usuario"}</h2>
                        <p className="text-muted-foreground">{user?.email}</p>
                        <span className="mt-2 px-3 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-bold rounded-full uppercase tracking-wide">
                            {(user as { rol?: string })?.rol || "Rol Desconocido"}
                        </span>
                    </div>

                    <form onSubmit={handleUpdate} className="p-8 space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                <FaEnvelope /> Correo Electrónico
                            </label>
                            <input 
                                type="email" 
                                value={user?.email || ""} 
                                disabled 
                                className="w-full p-3 rounded-xl bg-muted/50 border border-border text-muted-foreground cursor-not-allowed"
                            />
                            <p className="text-xs text-muted-foreground">El correo no se puede modificar.</p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground flex items-center gap-2">
                                <FaUser /> Nombre Completo
                            </label>
                            <input 
                                type="text" 
                                value={name} 
                                onChange={(e) => setName(e.target.value)}
                                className="w-full p-3 rounded-xl bg-input border border-border focus:border-primary outline-none transition-colors"
                                placeholder="Tu nombre"
                            />
                        </div>

                        <div className="border-t border-border pt-4">
                            <h3 className="text-sm font-bold text-muted-foreground mb-4 uppercase tracking-wider flex items-center gap-2">
                                <FaLock /> Seguridad
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground flex items-center gap-2">
                                        <FaKey /> Nueva Contraseña
                                    </label>
                                    <input 
                                        type="password" 
                                        value={password} 
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full p-3 rounded-xl bg-input border border-border focus:border-primary outline-none transition-colors"
                                        placeholder="Mínimo 6 caracteres"
                                        autoComplete="new-password"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground flex items-center gap-2">
                                        <FaKey /> Confirmar Contraseña
                                    </label>
                                    <input 
                                        type="password" 
                                        value={confirmPassword} 
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="w-full p-3 rounded-xl bg-input border border-border focus:border-primary outline-none transition-colors"
                                        placeholder="Repetir nueva contraseña"
                                        autoComplete="new-password"
                                    />
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                                Dejá estos campos vacíos si no querés cambiar tu contraseña.
                            </p>
                        </div>

                        <div className="pt-4">
                            <button 
                                type="submit" 
                                disabled={loading}
                                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? "Guardando..." : <><FaSave /> Guardar Cambios</>}
                            </button>
                        </div>
                    </form>
                </div>
             </div>

             <CustomAlert 
                isOpen={alert.isOpen}
                title={alert.title}
                message={alert.message}
                type={alert.type}
                onConfirm={() => setAlert(prev => ({ ...prev, isOpen: false }))}
             />
        </div>
    );
}
