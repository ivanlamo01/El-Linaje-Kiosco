import { NextRequest, NextResponse } from "next/server";
import { getAfipClient, normalizeCuit } from "@/app/lib/afip";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const cuitStr = searchParams.get("cuit");

    if (!cuitStr) {
        return NextResponse.json({ error: "El CUIT es obligatorio" }, { status: 400 });
    }

    const cuit = Number(cuitStr.replace(/\D/g, ""));
    if (isNaN(cuit) || String(cuit).length !== 11) {
        return NextResponse.json({ error: "CUIT inválido" }, { status: 400 });
    }

    try {
        const afip = getAfipClient();
        if (!afip) {
            return NextResponse.json({ error: "AFIP no configurado en el servidor" }, { status: 500 });
        }
        
        // Intentamos obtener los detalles del contribuyente usando los diferentes padrones disponibles
        const services = [
            afip.RegisterInscriptionProof,
            afip.RegisterScopeFive,
            afip.RegisterScopeFour,
            afip.RegisterScopeTen,
            afip.RegisterScopeThirteen,
        ].filter(Boolean);

        let personaData = null;
        let lastError = null;

        for (const service of services) {
            try {
                personaData = await service.getTaxpayerDetails(cuit);
                if (personaData) break;
            } catch (err) {
                lastError = err;
                // Continuamos con el siguiente servicio si este falla
            }
        }

        if (!personaData) {
            if (lastError) {
                const errorMsg = String((lastError as any)?.message || lastError);
                if (errorMsg.includes("no existe") || errorMsg.includes("error 404")) {
                  return NextResponse.json({ error: "Contribuyente no encontrado en el padrón de AFIP" }, { status: 404 });
                }
                throw lastError;
            }
            return NextResponse.json({ error: "No se pudieron obtener datos del contribuyente" }, { status: 404 });
        }

        const { normalizeTaxpayerData } = await import("@/app/lib/afip");
        const normalized = normalizeTaxpayerData(personaData, cuitStr);

        return NextResponse.json({ success: true, data: normalized });

    } catch (error: any) {
        console.error("Error en consulta de padrón:", error);
        return NextResponse.json({ 
            error: error.message || "Error al consultar el padrón de ARCA",
            details: String(error)
        }, { status: 500 });
    }
}
