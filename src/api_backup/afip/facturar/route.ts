import { NextRequest, NextResponse } from "next/server";
import { crearFacturaC } from "@/app/lib/afip";
import { adminDb } from "@/app/lib/services/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
    try {
        // 1. Verify Admin (Optional but recommended if not handled by middleware)
        // For simplicity, we assume the caller is trusted or we check a secret header/session if needed.
        // Ideally, check for a valid session cookie or token here.

        const body = await req.json();
        const { importe,  docNro, docTipo, email, nombre, items } = body;

        if (!importe) {
            return NextResponse.json({ error: "El importe es obligatorio" }, { status: 400 });
        }



        // 2. Call AFIP Service
        const result = await crearFacturaC(
            Number(importe),

            Number(docNro || 0),   // Default to Consumidor Final (0)
            Number(docTipo || 99)  // Default to Consumidor Final (99)
        );

        // 3. Save Invoice Record in Firestore (Optional but good for history)
        let firestoreId = null;
        if (adminDb) {
            const docRef = await adminDb.collection("facturas").add({
                ...result,
                importe: Number(importe),

                docNro: Number(docNro || 0),
                docTipo: Number(docTipo || 99),
                email: email || null,
                nombre: nombre || null,
                items: items || [], // Guardamos los items si vienen
                createdAt: FieldValue.serverTimestamp(),
                manual: true // Flag to indicate it was created manually from admin panel
            });
            firestoreId = docRef.id;
        }

        return NextResponse.json({ success: true, data: { ...result, id: firestoreId } });

    } catch (error: unknown) {
        console.error("API Facturación Error:", error);
        const err = error as Error;
        console.error("Stack:", err.stack);
        return NextResponse.json({ error: err.message || "Error al generar factura", details: String(error) }, { status: 500 });
    }
}
