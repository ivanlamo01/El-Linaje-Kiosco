"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, Timestamp, doc, deleteDoc, updateDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuthContext } from "../Context/AuthContext";
import { FaUserShield, FaUser, FaEnvelope, FaPhone, FaClock, FaTrash, FaLock, FaExclamationTriangle, FaEdit } from "react-icons/fa";
import type { Permissions } from "../types/authTypes";

interface UserData {
  uid: string;
  email: string;
  nombre: string;
  apellido?: string;
  telefono?: string;
  isAdmin: boolean;
  lastLogin?: Timestamp;
  lastLogout?: Timestamp;
  permissions?: Permissions;
}

export default function UsersPage() {
  const { login, user } = useAuthContext();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [tempPermissions, setTempPermissions] = useState<Permissions>({});

  const permissionList: { key: keyof Permissions; label: string }[] = [
    { key: "inventario", label: "Inventario" },
    { key: "cart", label: "Punto de Venta" },
    { key: "debtors", label: "Deudores" },
    { key: "users", label: "Usuarios" },
    { key: "sales", label: "Ventas" },
    { key: "facturacion", label: "Facturación" },
    { key: "facturas", label: "Facturas" },
    { key: "expenses", label: "Gastos" },
    { key: "graficos", label: "Gráficos" },
  ];

  useEffect(() => {
    const fetchUsers = async () => {
      if (login && user?.isAdmin) {
        try {
          const querySnapshot = await getDocs(collection(db, "Usuarios"));
          const usersData: UserData[] = querySnapshot.docs.map((docu) => {
            const data = docu.data();
            return {
              uid: docu.id,
              email: data.email,
              // Usamos nombre preferentemente
              nombre: data.nombre || data.name || "Usuario sin nombre",
              apellido: data.apellido,
              telefono: data.telefono,
              isAdmin: data.isAdmin,
              lastLogin: data.lastLogin,
              lastLogout: data.lastLogout,
              permissions: data.permissions || {},
            };
          });
          setUsers(usersData);
        } catch (error) {
          console.error("Error obteniendo usuarios:", error);
        }
      }
      setLoading(false);
    };

    fetchUsers();
  }, [login, user]);

  const openPermissionModal = (userTarget: UserData) => {
    setEditingUser(userTarget);
    setTempPermissions(userTarget.permissions || {});
  };

  const togglePermission = (key: keyof Permissions) => {
    setTempPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSavePermissions = async () => {
    if (!editingUser) return;
    try {
      await updateDoc(doc(db, "Usuarios", editingUser.uid), {
        permissions: tempPermissions,
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.uid === editingUser.uid ? { ...u, permissions: tempPermissions } : u
        )
      );
      setEditingUser(null);
    } catch (error) {
      console.error("Error updating permissions", error);
      alert("Error actualizando permisos");
    }
  };

  const handleDeleteUser = async (uid: string) => {
    if (window.confirm("¿Estás seguro de que deseas eliminar este usuario?")) {
      try {
        await deleteDoc(doc(db, "Usuarios", uid));
        setUsers(prev => prev.filter(u => u.uid !== uid));
      } catch (error) {
        console.error("Error eliminando usuario", error);
        alert("Error eliminando usuario");
      }
    }
  }

  // --- Loading ---
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-muted-foreground animate-pulse">Cargando usuarios...</p>
        </div>
      </div>
    )
  }

  // --- No Login ---
  if (!login) {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-6">
        <div className="text-center bg-card border border-border p-8 rounded-2xl max-w-md w-full shadow-2xl">
          <FaLock className="text-5xl text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-2">Acceso Restringido</h2>
          <p className="text-muted-foreground mb-6">Debes iniciar sesión para ver esta sección.</p>
        </div>
      </div>
    );
  }

  // --- Not Admin ---
  if (!user?.isAdmin) {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-6">
        <div className="text-center bg-card border-destructive/30 border p-8 rounded-2xl max-w-md w-full shadow-2xl">
          <FaExclamationTriangle className="text-5xl text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-2">Acceso Denegado</h2>
          <p className="text-muted-foreground">No tienes permisos de administrador para ver el listado de usuarios.</p>
        </div>
      </div>
    );
  }

  // --- Main Content ---
  return (
    <div className="min-h-screen bg-background text-foreground p-6 lg:p-8 transition-colors duration-300">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 border-b border-border pb-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-primary tracking-tight">Usuarios del Sistema</h1>
            <p className="text-muted-foreground mt-1">Administra los accesos y roles</p>
          </div>
          <div className="bg-card text-muted-foreground px-4 py-2 rounded-lg text-sm font-bold border border-border">
            Total: <span className="text-foreground">{users.length}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {users.map((u) => {
            const lastLogin = u.lastLogin ? u.lastLogin.toDate().toLocaleString("es-AR") : "Nunca";
            const lastLogout = u.lastLogout ? u.lastLogout.toDate().toLocaleString("es-AR") : "-";

            return (
              <div
                key={u.uid}
                className="group relative bg-card border border-border p-6 rounded-2xl shadow-sm hover:border-primary/50 transition-all duration-300 hover:shadow-md flex flex-col justify-between"
              >
                {/* Header Card */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-xl ${u.isAdmin ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                      {u.isAdmin ? <FaUserShield size={24} /> : <FaUser size={24} />}
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-card-foreground leading-tight">{u.nombre}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-wide ${u.isAdmin ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
                        {u.isAdmin ? 'Admin' : 'Personal'}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => openPermissionModal(u)}
                      className="text-muted-foreground hover:text-primary transition-colors bg-secondary hover:bg-primary/10 p-2 rounded-lg"
                      title="Editar Permisos"
                    >
                      <FaEdit size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteUser(u.uid)}
                      className="text-muted-foreground hover:text-destructive transition-colors bg-secondary hover:bg-destructive/10 p-2 rounded-lg"
                      title="Eliminar usuario"
                    >
                      <FaTrash size={14} />
                    </button>
                  </div>
                </div>

                {/* Body Info */}
                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-3 text-sm">
                    <FaEnvelope className="text-muted-foreground" />
                    <span className="text-card-foreground truncate" title={u.email}>{u.email}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <FaPhone className="text-muted-foreground" />
                    <span className="text-card-foreground">{u.telefono || "Sin teléfono"}</span>
                  </div>
                </div>

                {/* Footer Timestamps */}
                <div className="border-t border-border pt-4 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <FaClock /> Login
                    </div>
                    <span className="text-muted-foreground font-mono">{lastLogin}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <FaClock /> Logout
                    </div>
                    <span className="text-muted-foreground font-mono">{lastLogout}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Permission Modal */}
        {editingUser && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-card border border-border p-6 rounded-2xl max-w-lg w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <h2 className="text-xl font-bold mb-4 text-card-foreground flex items-center gap-2">
                <FaUserShield className="text-primary" /> Editar Accesos: {editingUser.nombre}
              </h2>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                {permissionList.map((perm) => (
                  <label key={perm.key} className="flex items-center gap-3 p-3 rounded-xl border border-border cursor-pointer hover:bg-secondary/50 transition-colors">
                    <input 
                        type="checkbox" 
                        checked={!!tempPermissions[perm.key]} 
                        onChange={() => togglePermission(perm.key)}
                        className="w-5 h-5 text-primary rounded focus:ring-primary bg-input border-muted"
                    />
                    <span className="text-sm font-medium">{perm.label}</span>
                  </label>
                ))}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-lg font-bold text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSavePermissions}
                  className="bg-primary hover:opacity-90 px-4 py-2 rounded-lg text-primary-foreground font-bold shadow-md"
                >
                  Guardar Cambios
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
