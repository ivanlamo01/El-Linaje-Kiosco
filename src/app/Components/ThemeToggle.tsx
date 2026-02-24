"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { FaSun, FaMoon } from "react-icons/fa"

export default function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
    const { theme, setTheme } = useTheme()
    const [mounted, setMounted] = React.useState(false)

    React.useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) {
        return (
            <div className={`p-2 rounded-xl bg-secondary text-muted-foreground animate-pulse ${collapsed ? "w-10 h-10" : "w-full h-10"}`} />
        )
    }

    return (
        <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className={`
        flex items-center gap-3 p-3 rounded-xl 
        text-muted-foreground hover:bg-secondary hover:text-foreground 
        transition-all duration-200
        ${collapsed ? "justify-center" : ""}
      `}
            title="Cambiar Tema"
        >
            {theme === "dark" ? (
                <FaSun size={20} className="text-yellow-500" />
            ) : (
                <FaMoon size={20} />
            )}
            {!collapsed && <span className="font-semibold">Modo {theme === "dark" ? "Claro" : "Oscuro"}</span>}
        </button>
    )
}
