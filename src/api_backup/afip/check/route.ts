import { NextResponse } from "next/server";
import { getServerStatus, getAfipClient } from "@/app/lib/afip";

// Re-implement fixPem here just for debugging visualization or import it if exported
const fixPemDebug = (str: string | undefined) => {
    if (!str) return "";
    let clean = str.replace(/\\n/g, '\n').trim();
    if (clean.includes("BEGIN CERTIFICATE") && !clean.includes("\n")) {
        clean = clean.replace("-----BEGIN CERTIFICATE-----", "-----BEGIN CERTIFICATE-----\n")
            .replace("-----END CERTIFICATE-----", "\n-----END CERTIFICATE-----");
    }
    if (clean.includes("BEGIN PRIVATE KEY") && !clean.includes("\n")) {
        clean = clean.replace("-----BEGIN PRIVATE KEY-----", "-----BEGIN PRIVATE KEY-----\n")
            .replace("-----END PRIVATE KEY-----", "\n-----END PRIVATE KEY-----");
    }
    return clean;
};

export async function GET() {
    try {
        const cert = process.env.AFIP_CERT || "";
        const key = process.env.AFIP_KEY || "";

        const fixedCert = fixPemDebug(cert);
        const fixedKey = fixPemDebug(key);

        const debugInfo = {
            timestamp: new Date().toISOString(),
            version: "1.0.1-debug-fix",
            env: {
                AFIP_CUIT: process.env.AFIP_CUIT,
                AFIP_PRODUCTION: process.env.AFIP_PRODUCTION,
                hasCert: !!cert,
                certLength: cert.length,
                certStartRaw: cert.substring(0, 40),
                certStartFixed: fixedCert.substring(0, 40),
                certHasNewlines: cert.includes('\n'),
                certHasEscapedNewlines: cert.includes('\\n'),
                
                hasKey: !!key,
                keyLength: key.length,
                keyStartRaw: key.substring(0, 40),
                keyStartFixed: fixedKey.substring(0, 40),
                
                nodeEnv: process.env.NODE_ENV,
            },
            afipClientInitialized: !!getAfipClient(),
        };        console.log("AFIP Check Debug:", debugInfo);

        // Try to connect to AFIP
        const status = await getServerStatus();

        return NextResponse.json({
            status: "OK",
            afipStatus: status,
            debug: debugInfo
        });

    } catch (error: unknown) {
        const err = error as Error;
        return NextResponse.json({
            status: "ERROR",
            error: err.message,
            stack: err.stack,
            debug: {
                env: {
                    AFIP_CUIT: process.env.AFIP_CUIT,
                    hasCert: !!process.env.AFIP_CERT,
                    hasKey: !!process.env.AFIP_KEY,
                }
            }
        }, { status: 500 });
    }
}
