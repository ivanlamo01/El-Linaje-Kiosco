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
        const { importe, concepto, docNro, docTipo, email, nombre, items, cbteTipo, saleId, ivaId, ivaRate, fechaComprobante } = body;
        const cbteTipoNum = Number(cbteTipo || 6);
        const docTipoNum = Number(docTipo || 99);
        const ivaIdNum = Number(ivaId || 5);

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

        if (fechaComprobante) {
            const selectedDate = new Date(`${fechaComprobante}T00:00:00`);
            if (Number.isNaN(selectedDate.getTime())) {
                return NextResponse.json({ error: "Fecha de comprobante inválida" }, { status: 400 });
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const minDate = new Date(today);
            minDate.setDate(minDate.getDate() - 5);

            if (selectedDate < minDate || selectedDate > today) {
                return NextResponse.json({
                    error: "La fecha del comprobante debe estar entre hoy y los ultimos 5 dias.",
                }, { status: 400 });
            }
        }

        if ((cbteTipoNum === 1 || cbteTipoNum === 6) && ivaIdNum === 3 && docTipoNum === 99) {
            return NextResponse.json(
                {
                    error: "No se permite IVA 0% en Factura A/B para Consumidor Final sin identificar. Indicá DNI/CUIT o seleccioná una alícuota gravada.",
                },
                { status: 400 }
            );
        }

        const envPos = process.env.AFIP_POS_PRODUCTOS ? parseInt(process.env.AFIP_POS_PRODUCTOS) : 9;
        console.log(`[API] Facturar - Solicitando con Punto de Venta: ${envPos} (Env: ${process.env.AFIP_POS_PRODUCTOS})`);

        const normalizedItems = Array.isArray(items) && items.length > 0
            ? items
            : [{
                title: "Comprobante",
                quantity: 1,
                price: Number(importe),
                ivaId: Number(ivaId || 5),
                ivaRate: Number(ivaRate || 21),
            }];

        // 2. Call AFIP Service
        const result = await crearFactura(
            Number(importe),
            Number(concepto || 1), // Default to Productos
            Number(docNro || 0),   // Default to Consumidor Final (0)
            docTipoNum, // Default to Consumidor Final (99)
            envPos,                // Explicit POS
            cbteTipoNum,   // Default to Factura B (Responsable Inscripto)
            normalizedItems,
            fechaComprobante || undefined
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
                items: normalizedItems,
                ivaSubtotales: result.ivaSubtotales || [],
                impTrib: result.impTrib || 0,
                tributos: result.tributos || [],
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

