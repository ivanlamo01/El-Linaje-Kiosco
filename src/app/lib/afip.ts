import Afip from '@afipsdk/afip.js';
import os from 'os';
import path from 'path';
import fs from 'fs';

interface AfipVoucherIva {
    Id: number;
    BaseImp: number;
    Importe: number;
}

interface AfipVoucherAsoc {
    Tipo: number;
    PtoVta: number;
    Nro: number;
}

interface AfipVoucherData {
    CantReg: number;
    PtoVta: number;
    CbteTipo: number;
    Concepto: number;
    DocTipo: number;
    DocNro: number;
    CbteDesde: number;
    CbteHasta: number;
    CbteFch: string;
    ImpTotal: number;
    ImpTotConc: number;
    ImpNeto: number;
    ImpOpEx: number;
    ImpIVA: number;
    ImpTrib: number;
    MonId: string;
    MonCotiz: number;
    Iva?: AfipVoucherIva[];
    CbtesAsoc?: AfipVoucherAsoc[];
    FchServDesde?: string;
    FchServHasta?: string;
    FchVtoPago?: string;
}

interface AfipError {
    status?: number;
    message?: string;
}

const AFIP_CUIT = process.env.AFIP_CUIT ? parseInt(process.env.AFIP_CUIT) : 0;

// Helper to fix PEM format if it's messed up (e.g. missing newlines)
const fixPem = (str: string | undefined) => {
    if (!str) return "";

    // 1. Replace literal "\n" with actual newlines
    let clean = str.replace(/\\n/g, '\n').trim();

    // 2. Check if it's a one-liner without newlines (and has headers)
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

const AFIP_CERT = fixPem(process.env.AFIP_CERT);
const AFIP_KEY = fixPem(process.env.AFIP_KEY);

// Production mode: Defaults to TRUE unless explicitly set to 'false'
const AFIP_PRODUCTION = process.env.AFIP_PRODUCTION === 'false' ? false : true;

// Puntos de Venta Configuration
const AFIP_POS_PRODUCTOS = process.env.AFIP_POS_PRODUCTOS ? parseInt(process.env.AFIP_POS_PRODUCTOS) : 9;



function getPuntoVenta() {
    return AFIP_POS_PRODUCTOS;
}

let afipInstance: InstanceType<typeof Afip> | null = null;

export const getAfipClient = () => {
    if (afipInstance) return afipInstance;



    // 2. Standard Logic (Production or Configured Homologation)
    if (!AFIP_CUIT || !AFIP_CERT || !AFIP_KEY) {
        console.warn("AFIP SDK: Faltan variables de entorno (AFIP_CUIT, AFIP_CERT, AFIP_KEY). El servicio no funcionará correctamente.");
        return null;
    }

    try {
        afipInstance = new Afip({
            CUIT: AFIP_CUIT,
            cert: AFIP_CERT,
            key: AFIP_KEY,
            production: AFIP_PRODUCTION,
            access_token: process.env.AFIP_SDK_ACCESS_TOKEN,
            res_folder: os.tmpdir()
        });
        return afipInstance;
    } catch (error) {
        console.error("Error inicializando AFIP SDK:", error);
        return null;
    }
};

/**
 * Obtiene un cliente AFIP configurado solo con el Access Token para tareas administrativas.
 * Útil para crear certificados o autorizar web services.
 * @param cuit Optional CUIT to initialize the client with
 */
export const getAfipAdminClient = (cuit?: number) => {
    const accessToken = process.env.AFIP_SDK_ACCESS_TOKEN;
    if (!accessToken) {
        throw new Error("AFIP_SDK_ACCESS_TOKEN no configurado");
    }

    return new Afip({
        access_token: accessToken,
        production: true,
        res_folder: os.tmpdir(),
        CUIT: cuit
    });
};

/**
 * Genera una Factura C (Código 11) para Monotributistas.
 * @param importe Total de la factura
 * @param concepto 1 = Productos, 2 = Servicios, 3 = Productos y Servicios
 * @param docNro Número de documento del comprador (0 para consumidor final sin identificar si es monto bajo)
 * @param docTipo Tipo de documento (96 = DNI, 80 = CUIT, 99 = Consumidor Final)
 * @param puntoVenta Punto de venta a utilizar (opcional, usa el configurado en ENV si no se pasa)
 * @param cbteTipo Tipo de Comprobante (11 = Factura C, 6 = Factura B, 1 = Factura A). Por defecto 6 (Factura B).
 */
export const crearFactura = async (
    importe: number,
    concepto: number = 1,
    docNro: number = 0,
    docTipo: number = 99,
    puntoVenta?: number,
    cbteTipo: number = 6
) => {
    const afip = getAfipClient();
    if (!afip) throw new Error("AFIP no configurado");

    try {
        // 1. Obtener el último número de comprobante
        const ptoVta = puntoVenta || getPuntoVenta();
        console.log(`[AFIP] Iniciando facturación (Tipo ${cbteTipo}) - Punto de Venta: ${ptoVta}, Importe: ${importe}, Doc: ${docTipo}/${docNro}`);

        let nroComprobante = 0;
        try {
            const lastVoucher = await afip.ElectronicBilling.getLastVoucher(ptoVta, cbteTipo);
            nroComprobante = lastVoucher + 1;
        } catch (e: unknown) {
            const error = e as AfipError;
            // En modo TEST, si falla la conexión (401/Token), usar Mock
            throw e;
        }

        const date = new Date();
        const formattedDate = date.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD

        // 2. Preparar datos del comprobante
        const data: AfipVoucherData = {
            'CantReg': 1, // Cantidad de comprobantes a registrar
            'PtoVta': ptoVta,
            'CbteTipo': cbteTipo,
            'Concepto': concepto,
            'DocTipo': docTipo,
            'DocNro': docNro,
            'CbteDesde': nroComprobante,
            'CbteHasta': nroComprobante,
            'CbteFch': formattedDate,
            'ImpTotal': importe,
            'ImpTotConc': 0, // Importe neto no gravado
            'ImpNeto': importe, // Importe neto gravado
            'ImpOpEx': 0, // Importe exento
            'ImpIVA': 0, // Importe de IVA
            'ImpTrib': 0, // Importe de tributos
            'MonId': 'PES', // Moneda
            'MonCotiz': 1, // Cotización
        };


        if (cbteTipo === 1 || cbteTipo === 6) { // A or B

            const alicuotaIva = 21; // Standard
            const netAmount = Number((importe / (1 + (alicuotaIva / 100))).toFixed(2));
            const ivaAmount = Number((importe - netAmount).toFixed(2));

            // Adjust rounding diff on 'ImpNeto' to match 'ImpTotal' exactly
            // ImpTotal = ImpNeto + ImpIVA

            data.ImpNeto = netAmount;
            data.ImpIVA = ivaAmount;
            data.ImpTotal = Number((netAmount + ivaAmount).toFixed(2)); // Should match 'importe' closely

            // We must add 'Iva' array property
            data.Iva = [
                {
                    'Id': 5, // 21%
                    'BaseImp': netAmount,
                    'Importe': ivaAmount
                }
            ];
        }


        // 3. Crear comprobante (CAE)
        let res;
        try {
            res = await afip.ElectronicBilling.createVoucher(data);
        } catch (e: unknown) {
            const error = e as AfipError;
            // En modo TEST, si falla la conexión (401/Token), crear respuesta Mock

            throw e;
        }

        return {
            success: true,
            cae: res.CAE,
            vencimientoCae: res.CAEFchVto,
            nroComprobante,
            puntoVenta: ptoVta,
            tipoComprobante: cbteTipo,
            // Return financial data so it gets saved to DB
            impTotal: data.ImpTotal,
            impNeto: data.ImpNeto,
            impIVA: data.ImpIVA || 0,
            cbteFch: formattedDate,
        };

    } catch (error: unknown) {
        console.error("Error creando factura AFIP:", error);
        const err = error as Error;
        throw new Error(err.message || "Error al crear factura en AFIP");
    }
};

/**
 * DEPRECATED: Use crearFactura instead. Kept for backward compatibility.
 */
export const crearFacturaC = async (importe: number, concepto: number = 1, docNro: number = 0, docTipo: number = 99, puntoVenta?: number) => {
    return crearFactura(importe, concepto, docNro, docTipo, puntoVenta, 11);
};

/**
 * Genera una Nota de Crédito C (Código 13) para anular una Factura C.
 * @param importe Total de la nota de crédito (debe coincidir con la factura a anular)
 * @param comprobanteAsociado Número de la factura original a anular
 * @param concepto 
 * @param docNro Número de documento del comprador
 * @param docTipo Tipo de documento
 */
export const crearNotaCreditoC = async (
    importe: number,
    comprobanteAsociado: number,
    concepto: number = 1,
    docNro: number = 0,
    docTipo: number = 99,
    puntoVenta?: number
) => {
    const afip = getAfipClient();
    if (!afip) throw new Error("AFIP no configurado");

    try {
        const ptoVta = puntoVenta || getPuntoVenta();
        const tipoComprobante = 13; // 13 = Nota de Crédito C

        let nroComprobante = 0;
        try {
            const lastVoucher = await afip.ElectronicBilling.getLastVoucher(ptoVta, tipoComprobante);
            nroComprobante = lastVoucher + 1;
        } catch (e: unknown) {
            const error = e as AfipError;
            // En modo TEST, si falla la conexión (401/Token), usar Mock
            throw e;
        }

        const date = new Date();
        const formattedDate = date.toISOString().slice(0, 10).replace(/-/g, '');

        const data: AfipVoucherData = {
            'CantReg': 1,
            'PtoVta': ptoVta,
            'CbteTipo': tipoComprobante,
            'Concepto': concepto,
            'DocTipo': docTipo,
            'DocNro': docNro,
            'CbteDesde': nroComprobante,
            'CbteHasta': nroComprobante,
            'CbteFch': formattedDate,
            'ImpTotal': importe,
            'ImpTotConc': 0,
            'ImpNeto': importe,
            'ImpOpEx': 0,
            'ImpIVA': 0,
            'ImpTrib': 0,
            'MonId': 'PES',
            'MonCotiz': 1,
            'CbtesAsoc': [
                {
                    'Tipo': 11, // Factura C
                    'PtoVta': ptoVta,
                    'Nro': comprobanteAsociado
                }
            ]
        };

        if (concepto === 2 || concepto === 3) {
            Object.assign(data, {
                'FchServDesde': formattedDate,
                'FchServHasta': formattedDate,
                'FchVtoPago': formattedDate,
            });
        }

        let res;
        try {
            res = await afip.ElectronicBilling.createVoucher(data);
        } catch (e: unknown) {
            const error = e as AfipError;
            // En modo TEST, si falla la conexión (401/Token), crear respuesta Mock

            throw e;
        }

        return {
            success: true,
            cae: res.CAE,
            vencimientoCae: res.CAEFchVto,
            nroComprobante,
            puntoVenta: ptoVta,
            tipoComprobante,
            cbteFch: formattedDate,
        };

    } catch (error: unknown) {
        console.error("Error creando Nota de Crédito AFIP:", error);
        const err = error as Error;
        throw new Error(err.message || "Error al crear Nota de Crédito en AFIP");
    }
};

/**
 * Obtiene información del servidor de AFIP (Estado del servicio)
 */
export const getServerStatus = async () => {
    const afip = getAfipClient();
    if (!afip) return null;
    return await afip.ElectronicBilling.getServerStatus();
};

/**
 * Obtiene los Puntos de Venta habilitados para Factura Electrónica
 */
export const getPuntosVenta = async () => {
    const afip = getAfipClient();
    if (!afip) throw new Error("AFIP no configurado");

    try {
        // null means get all
        const pts = await afip.ElectronicBilling.getSalesPoints();
        return pts;
    } catch (error) {
        console.error("Error obteniendo puntos de venta:", error);
        throw error;
    }
};
