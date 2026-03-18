import { NextResponse } from "next/server";

export async function GET() {
    const envPos = process.env.AFIP_POS_PRODUCTOS ? parseInt(process.env.AFIP_POS_PRODUCTOS, 10) : 9;

    return NextResponse.json({
        success: true,
        data: {
            puntoVenta: envPos,
            descripcion: "Punto de venta configurado para facturacion por web service",
        },
    });
}
