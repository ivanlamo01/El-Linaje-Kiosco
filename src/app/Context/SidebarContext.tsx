"use client";
import React, { createContext, useContext, useState, ReactNode } from "react";

interface SidebarContextProps {
    isCollapsed: boolean;
    toggleSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextProps>({
    isCollapsed: false,
    toggleSidebar: () => { },
});

export const SidebarProvider = ({ children }: { children: ReactNode }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const toggleSidebar = () => setIsCollapsed(!isCollapsed);

    return (
        <SidebarContext.Provider value={{ isCollapsed, toggleSidebar }}>
            {children}
        </SidebarContext.Provider>
    );
};

export const useSidebar = () => useContext(SidebarContext);
