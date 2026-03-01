"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export default function LightModeBackground() {
    const { resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    console.log("LightModeBackground Status:", { mounted, resolvedTheme });

    if (!mounted || resolvedTheme === 'dark') {
        return null;
    }

    return (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
            <svg 
                className="w-full h-full object-cover fixed opacity-[0.45]" 
                preserveAspectRatio="xMidYMid slice" 
                viewBox="0 0 1920 1080" 
                xmlns="http://www.w3.org/2000/svg"
            >
                {/* 1. Fondo Superior Izquierdo: Formas Geométricas Idénticas al Menú */}
                {/* Triángulo Gris Pizarra en Esquina */}
                <polygon points="0,0 600,0 0,600" fill="#A3B1B6" />
                
                {/* Cuadrado/Rombo Castaño-Naranja interactuando con la diagonal */}
                <g transform="translate(180, 240) rotate(45)">
                    <rect x="-120" y="-120" width="240" height="240" fill="#BA8052" opacity="0.95" />
                </g>

                {/* Pequeño triángulo Marrón Oscuro acompañando (como en el logo) */}
                <polygon points="300,0 550,0 300,250" fill="#5A3828" opacity="0.9" />


                {/* 2. Centro de Pantalla: Círculos Traslúcidos Solapados Exactos */}
                {/* Posicionados en el centro exacto como gran marca de agua */}
                <g transform="translate(960, 540) scale(1.6)" style={{ mixBlendMode: 'multiply' }}>
                    <circle cx="0" cy="-75" r="90" fill="#C5A48A" opacity="0.9" />    {/* Arriba */}
                    <circle cx="75" cy="0" r="90" fill="#DBB996" opacity="0.7" />     {/* Derecha */}
                    <circle cx="0" cy="75" r="90" fill="#9C7864" opacity="0.9" />     {/* Abajo */}
                    <circle cx="-75" cy="0" r="90" fill="#D2A377" opacity="0.8" />    {/* Izquierda */}
                </g>


                {/* 3. Lateral Derecho: Flor Retro 5 Pétalos Fiel */}
                <g transform="translate(1920, 800)" fill="#CDB59E" opacity="0.9">
                    {/* Pétalos radiales sólidos  */}
                    <g transform="rotate(0)"><path d="M0,0 C -500,-250 -500,250 0,0" /></g>
                    <g transform="rotate(72)"><path d="M0,0 C -500,-250 -500,250 0,0" /></g>
                    <g transform="rotate(144)"><path d="M0,0 C -500,-250 -500,250 0,0" /></g>
                    <g transform="rotate(216)"><path d="M0,0 C -500,-250 -500,250 0,0" /></g>
                    <g transform="rotate(288)"><path d="M0,0 C -500,-250 -500,250 0,0" /></g>
                    <circle cx="0" cy="0" r="100" />
                </g>

                {/* 4. Base Izquierda: Fila de Triángulos direccionales (90 grados) */}
                {/* Triángulos separados apuntando puramente a la derecha reproduciendo la referencia visual */}
                <g transform="translate(80, 950) scale(1.2)">
                    <polygon points="0,0 80,45 0,90" fill="#A3B1B6" opacity="0.8" />
                    <polygon points="120,0 200,45 120,90" fill="#BA8052" />
                    <polygon points="240,0 320,45 240,90" fill="#A3B1B6" opacity="0.8" />
                    <polygon points="360,0 440,45 360,90" fill="#BA8052" />
                    <polygon points="480,0 560,45 480,90" fill="#A3B1B6" opacity="0.8" />
                    <polygon points="600,0 680,45 600,90" fill="#BA8052" />
                    <polygon points="720,0 800,45 720,90" fill="#A3B1B6" opacity="0.8" />
                </g>
            </svg>
        </div>
    );
}
