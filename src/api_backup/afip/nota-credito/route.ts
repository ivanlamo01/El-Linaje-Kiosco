import { NextRequest, NextResponse } from "next/server";
import { crearNotaCreditoC } from "@/app/lib/afip";
import { adminDb } from "@/app/lib/services/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { facturaId, importe,  docNro, docTipo, nroComprobanteOriginal } = body;

        if (!facturaId || !importe || !nroComprobanteOriginal) {
            return NextResponse.json({ error: "Faltan datos obligatorios" }, { status: 400 });
        }

        // 1. Call AFIP Service to create Credit Note
        const result = await crearNotaCreditoC(
            Number(importe),
            Number(nroComprobanteOriginal),

            Number(docNro || 0),
            Number(docTipo || 99)
        );

        // 2. Update original invoice status in Firestore
        if (adminDb) {
            // Create the Credit Note record
            await adminDb.collection("facturas").add({
                ...result,
                importe: Number(importe),

                docNro,
                docTipo,
                facturaAsociadaId: facturaId,
                nroComprobanteAsociado: nroComprobanteOriginal,
                createdAt: FieldValue.serverTimestamp(),
                tipo: "NC" // Nota de Crédito
            });

            // Mark original invoice as Cancelled (Anulada)
            await adminDb.collection("facturas").doc(facturaId).update({
                status: "anulada",
                notaCredito: result.nroComprobante
            });
        }

        return NextResponse.json({ success: true, data: result });

    } catch (error) {
        console.error("API Nota Crédito Error:", error);
        return NextResponse.json({ error: (error as Error).message || "Error al generar nota de crédito", details: (error as Error).toString() }, { status: 500 });
    }
}
