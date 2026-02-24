"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { TutorialProvider } from "../Context/TutorialContext"

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
            <TutorialProvider>
                {children}
            </TutorialProvider>
        </NextThemesProvider>
    )
}
