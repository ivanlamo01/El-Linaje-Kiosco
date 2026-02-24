"use client";
import React from "react";
import { useSidebar } from "../Context/SidebarContext";

export default function MainLayout({ children }: { children: React.ReactNode }) {
    const { isCollapsed } = useSidebar();

    return (
        <main
            className={`pt-16 lg:pt-0 min-h-screen transition-all duration-300 ease-in-out ${isCollapsed ? "lg:ml-20" : "lg:ml-60"
                }`}
        >
            {children}
        </main>
    );
}
