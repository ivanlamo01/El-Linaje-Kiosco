import { NextRequest, NextResponse } from "next/server";
import { crearFactura, getPuntosVenta } from "@/app/lib/afip";
import { adminDb } from "@/app/lib/services/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
    try {
        // 1. Verify Admin (Optional but recommended if not handled by middleware)
        // For simplicity, we assume the caller is trusted or we check a secret header/session if needed.
        // Ideally, check for a valid session cookie or token here.

        const body = await req.json();
        const { importe, concepto, docNro, docTipo, email, nombre, items, cbteTipo, saleId } = body;

        // 1. Validator: Check if sale is already invoiced (Prevent Duplicates if saleId is present)
        if (saleId && adminDb) {
            try {
                const saleDoc = await adminDb.collection('sales').doc(saleId).get();
                if (saleDoc.exists) {
                    const saleData = saleDoc.data();
                    if (saleData?.facturaId) {
                        return NextResponse.json(
                            { error: "Venta ya facturada", data: { id: saleData.facturaId } }, // Return the existing invoice ID
                            { status: 409 } // Conflict
                        );
                    }
                }
            } catch (checkErr) {
                console.warn("Could not verify invoice status for saleId:", saleId, checkErr);
            }
        }

        if (!importe) {
            return NextResponse.json({ error: "El importe es obligatorio" }, { status: 400 });
        }

        const envPos = process.env.AFIP_POS_PRODUCTOS ? parseInt(process.env.AFIP_POS_PRODUCTOS) : 9;
        console.log(`[API] Facturar - Solicitando con Punto de Venta: ${envPos} (Env: ${process.env.AFIP_POS_PRODUCTOS})`);

        // 2. Call AFIP Service
        const result = await crearFactura(
            Number(importe),
            Number(concepto || 1), // Default to Productos
            Number(docNro || 0),   // Default to Consumidor Final (0)
            Number(docTipo || 99), // Default to Consumidor Final (99)
            envPos,                // Explicit POS
            Number(cbteTipo || 6)   // Default to Factura B (Responsable Inscripto)
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
                manual: true, // Flag to indicate it was created manually from admin panel
                saleId: saleId || null // Link invoice to sale if provided
            });
            firestoreId = docRef.id;

            // 4. Update the Sale document if saleId is provided
            if (saleId) {
                try {
                    await adminDb.collection("sales").doc(saleId).update({
                        facturaId: firestoreId
                    });
                } catch (updateErr) {
                    console.error(`[API] Error updating sale ${saleId} with facturaId:`, updateErr);
                    // Non-critical error, invoice is already created.
                }
            }
        }

        return NextResponse.json({ success: true, data: { ...result, id: firestoreId } });

    } catch (error: unknown) {
        console.error("API Facturación Error:", error);
        const err = error as Error;
        const msg = err.message || "";

        // Diagnostic for Error 11002 (Invalid POS)
        if (msg.includes("11002") || msg.includes("Punto de Venta no")) {
            try {
                const availablePoints = await getPuntosVenta();
                console.log("--- Puntos de Venta Habilitados ---");
                console.log(availablePoints);
                return NextResponse.json({
                    error: `${msg}. Puntos de venta disponibles: ${JSON.stringify(availablePoints)}`,
                    details: String(error)
                }, { status: 500 });
            } catch (fetchErr) {
                console.error("Error fetching sales points for diagnostic:", fetchErr);
            }
        }

        console.error("Stack:", err.stack);
        return NextResponse.json({ error: err.message || "Error al generar factura", details: String(error) }, { status: 500 });
    }
}

