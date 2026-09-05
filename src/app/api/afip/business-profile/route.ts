import { NextResponse } from "next/server";
import { getAfipBusinessProfile } from "@/app/lib/afip";
import fs from "fs";
import path from "path";
import { parse as parseDotenv } from "dotenv";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FALLBACK_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedBusinessProfile: unknown = null;
let cachedAt = 0;
let cachedSource: "afip" | "fallback" | null = null;

const readDotEnvFile = () => {
    try {
        const envPath = path.join(process.cwd(), ".env");
        if (!fs.existsSync(envPath)) return {} as Record<string, string>;
        const raw = fs.readFileSync(envPath, "utf8");
        return parseDotenv(raw);
    } catch {
        return {} as Record<string, string>;
    }
};

const getEnvValue = (key: string, envFile: Record<string, string>) => {
    const fromProcess = process.env[key];
    if (fromProcess !== undefined && String(fromProcess).trim() !== "") return String(fromProcess);

    const fromFile = envFile[key];
    if (fromFile !== undefined && String(fromFile).trim() !== "") return String(fromFile);

    return undefined;
};

const cleanEnv = (value?: string) => {
    const v = String(value || "").trim();
    return v.length > 0 ? v : undefined;
};

const resolveBusinessCuit = (envFile: Record<string, string>) => {
    return (
        cleanEnv(getEnvValue("BUSINESS_CUIT", envFile)) ||
        cleanEnv(getEnvValue("AFIP_CUIT", envFile)) ||
        cleanEnv(getEnvValue("NEXT_PUBLIC_BUSINESS_CUIT", envFile)) ||
        "No informado"
    );
};

const getFallbackBusinessProfile = (envFile: Record<string, string>) => ({
    name: cleanEnv(getEnvValue("BUSINESS_NAME", envFile)) || cleanEnv(getEnvValue("NEXT_PUBLIC_BUSINESS_NAME", envFile)) || "LO DE MARTHA",
    cuit: resolveBusinessCuit(envFile),
    address: cleanEnv(getEnvValue("BUSINESS_ADDRESS", envFile)) || cleanEnv(getEnvValue("NEXT_PUBLIC_BUSINESS_ADDRESS", envFile)) || "No informado",
    startActivity: cleanEnv(getEnvValue("BUSINESS_START_ACTIVITY", envFile)) || cleanEnv(getEnvValue("NEXT_PUBLIC_BUSINESS_START_ACTIVITY", envFile)) || "No informado",
    iibb: cleanEnv(getEnvValue("BUSINESS_IIBB", envFile)) || cleanEnv(getEnvValue("NEXT_PUBLIC_BUSINESS_IIBB", envFile)) || "No informado",
    condition: cleanEnv(getEnvValue("BUSINESS_CONDITION", envFile)) || cleanEnv(getEnvValue("NEXT_PUBLIC_BUSINESS_CONDITION", envFile)) || "Responsable Monotributo",
});

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number) => {
    return await Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout consultando AFIP (${timeoutMs}ms)`)), timeoutMs)
        ),
    ]);
};

const toFriendlyWarning = (message: string) => {
    const lowered = message.toLowerCase();

    if (lowered.includes("status code 400")) {
        return "AFIP rechazo la consulta del CUIT. Revisa que AFIP_CUIT tenga 11 digitos y que el servicio de padron este habilitado en tu certificado.";
    }

    if (lowered.includes("status code 401") || lowered.includes("status code 403")) {
        return "AFIP rechazo la autenticacion. Verifica certificado, clave privada y token del SDK.";
    }

    return message;
};

export async function GET(req: Request) {
    const now = Date.now();
    const url = new URL(req.url);
    const forceRefresh = url.searchParams.get("force") === "1";
    const envFile = readDotEnvFile();
    const timeoutMs = Number(cleanEnv(getEnvValue("AFIP_PROFILE_TIMEOUT_MS", envFile)) || 20000);

    try {
        const ttl = cachedSource === "fallback" ? FALLBACK_CACHE_TTL_MS : CACHE_TTL_MS;
        const shouldUseCache = !forceRefresh && cachedBusinessProfile && now - cachedAt < ttl;

        if (shouldUseCache) {
            return NextResponse.json({
                success: true,
                data: cachedBusinessProfile,
                meta: {
                    cached: true,
                    cachedAt,
                    ttlMs: ttl,
                    source: cachedSource,
                },
            }, {
                headers: {
                    "Cache-Control": "no-store",
                },
            });
        }

        const data = await withTimeout(getAfipBusinessProfile(), timeoutMs);

        cachedBusinessProfile = data;
        cachedAt = now;
        cachedSource = "afip";

        return NextResponse.json({
            success: true,
            data,
            meta: {
                cached: false,
                cachedAt,
                ttlMs: CACHE_TTL_MS,
                source: "afip",
            },
        }, {
            headers: {
                "Cache-Control": "no-store",
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Error obteniendo perfil fiscal";
        const friendlyWarning = toFriendlyWarning(message);

        // If we already have a valid AFIP profile cached, keep serving it on transient failures.
        if (cachedSource === "afip" && cachedBusinessProfile) {
            return NextResponse.json({
                success: true,
                data: cachedBusinessProfile,
                meta: {
                    cached: true,
                    cachedAt,
                    ttlMs: CACHE_TTL_MS,
                    source: "afip",
                    stale: true,
                    warning: friendlyWarning,
                },
            }, {
                headers: {
                    "Cache-Control": "no-store",
                },
            });
        }

        const fallback = getFallbackBusinessProfile(envFile);

        cachedBusinessProfile = fallback;
        cachedAt = now;
        cachedSource = "fallback";

        return NextResponse.json({
            success: true,
            data: fallback,
            meta: {
                cached: false,
                cachedAt,
                ttlMs: FALLBACK_CACHE_TTL_MS,
                source: "fallback",
                warning: friendlyWarning,
            },
        }, {
            headers: {
                "Cache-Control": "no-store",
            },
        });
    }
}
