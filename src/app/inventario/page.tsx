"use client";

import React, { useState } from "react";
import Tabla from "../Components/tabla";
import InventoryDetailedPanel from "../Components/InventoryDetailedPanel";

function Inventario() {
  const [activeTab, setActiveTab] = useState<"tabla" | "detalle">("tabla");

  return (
    <div className="min-h-screen bg-background text-foreground p-6 lg:p-8 transition-colors duration-300">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 border-b border-border pb-4">
          <h1 className="text-4xl font-bold text-primary tracking-tight">Inventario General</h1>
          <p className="text-muted-foreground mt-2">Gestiona tus productos y categorías</p>
        </div>

        <div className="mb-6 flex gap-2 border-b border-border pb-3">
          <button
            type="button"
            onClick={() => setActiveTab("tabla")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === "tabla"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-foreground hover:bg-secondary/80"
            }`}
          >
            Inventario
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("detalle")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === "detalle"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-foreground hover:bg-secondary/80"
            }`}
          >
            Panel Detallado
          </button>
        </div>

        {activeTab === "tabla" ? <Tabla /> : <InventoryDetailedPanel />}
      </div>
    </div>
  );
}

export default Inventario;
