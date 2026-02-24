/**
 * Servicio para gestionar certificados y autorizaciones de AFIP en producción
 */

export interface CreateCertProductionData {
    cuit: string;
    username: string;
    password: string;
    alias: string;
}

export interface AuthWebServiceProductionData extends CreateCertProductionData {
    service: string; // Ejemplo: 'wsfe', 'wsfev1', etc.
}

export interface CertificateResponse {
    cert: string;
    key: string;
}

/**
 * Crea un certificado de producción en AFIP
 * @param data - Datos necesarios para crear el certificado
 * @returns Certificado y clave privada
 */
export async function createCertificateProduction(
    data: CreateCertProductionData
): Promise<CertificateResponse> {
    const response = await fetch('/api/afip/create-cert-prod', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    });

    const result = await response.json();

    if (!response.ok) {
        // Mejorar captura de error para incluir detalles del backend
        const errorMessage = result.details 
            ? (typeof result.details === 'object' ? JSON.stringify(result.details) : result.details)
            : (result.error || 'Error al crear el certificado de producción');
        throw new Error(errorMessage);
    }

    return result.data;
}

/**
 * Autoriza un web service de producción en AFIP
 * @param data - Datos necesarios para autorizar el web service
 * @returns Estado de la autorización
 */
export async function authorizeWebServiceProduction(
    data: AuthWebServiceProductionData
): Promise<{ status: string }> {
    const response = await fetch('/api/afip/auth-web-service-prod', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    });

    const result = await response.json();

    if (!response.ok) {
        // Mejorar captura de error
        const errorMessage = result.details 
            ? (typeof result.details === 'object' ? JSON.stringify(result.details) : result.details)
            : (result.error || 'Error al autorizar el web service de producción');
        throw new Error(errorMessage);
    }

    return result.data;
}

/**
 * Proceso completo: Crea el certificado y autoriza el web service
 * @param data - Datos necesarios
 * @returns Certificado, clave y estado de autorización
 */
export async function setupAfipProduction(
    data: AuthWebServiceProductionData
): Promise<{
    certificate: CertificateResponse;
    authorization: { status: string };
}> {
    // Paso 1: Crear el certificado
    const certificate = await createCertificateProduction({
        cuit: data.cuit,
        username: data.username,
        password: data.password,
        alias: data.alias,
    });

    // Paso 2: Autorizar el web service
    const authorization = await authorizeWebServiceProduction(data);

    return {
        certificate,
        authorization,
    };
}

/**
 * Guarda el certificado en archivos locales (solo en desarrollo)
 * En producción deberías guardar en un lugar seguro
 */
export function downloadCertificate(cert: string, key: string, alias: string) {
    // Crear archivo de certificado
    const certBlob = new Blob([cert], { type: 'text/plain' });
    const certUrl = URL.createObjectURL(certBlob);
    const certLink = document.createElement('a');
    certLink.href = certUrl;
    certLink.download = `${alias}.crt`;
    certLink.click();
    URL.revokeObjectURL(certUrl);

    // Crear archivo de clave privada
    const keyBlob = new Blob([key], { type: 'text/plain' });
    const keyUrl = URL.createObjectURL(keyBlob);
    const keyLink = document.createElement('a');
    keyLink.href = keyUrl;
    keyLink.download = `${alias}.key`;
    keyLink.click();
    URL.revokeObjectURL(keyUrl);
}
