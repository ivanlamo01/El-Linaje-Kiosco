import Afip from '@afipsdk/afip.js';
import os from 'os';
import path from 'path';
import fs from 'fs';

interface AfipVoucherIva {
    Id: number;
    BaseImp: number;
    Importe: number;
}

interface AfipVoucherTributo {
    Id: number;
    Desc: string;
    BaseImp: number;
    Alic: number;
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
    Tributos?: AfipVoucherTributo[];
    CbtesAsoc?: AfipVoucherAsoc[];
    FchServDesde?: string;
    FchServHasta?: string;
    FchVtoPago?: string;
}

interface InvoiceItemInput {
    title?: string;
    description?: string;
    category?: string;
    quantity?: number | string;
    price?: number | string;
    ivaId?: number | string;
    ivaRate?: number | string;
    isCigarette?: boolean;
    tributeRate?: number | string;
}

interface IvaSubtotal {
    id: number;
    rate: number;
    base: number;
    amount: number;
}

interface TributeSubtotal {
    id: number;
    description: string;
    rate: number;
    base: number;
    amount: number;
}

interface AfipError {
    status?: number;
    message?: string;
}

export interface AfipBusinessProfile {
    name: string;
    cuit: string;
    address: string;
    startActivity?: string;
    iibb?: string;
    condition?: string;
}

export const normalizeCuit = (value: unknown) => String(value ?? "").replace(/\D/g, "").trim();
export const parseCuit = (value: unknown) => {
    const digits = normalizeCuit(value);
    if (digits.length !== 11) return 0;
    const parsed = Number(digits);
    return Number.isFinite(parsed) ? parsed : 0;
};

const AFIP_CUIT = parseCuit(process.env.AFIP_CUIT);

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
    if (clean.includes("BEGIN RSA PRIVATE KEY") && !clean.includes("\n")) {
        clean = clean.replace("-----BEGIN RSA PRIVATE KEY-----", "-----BEGIN RSA PRIVATE KEY-----\n")
            .replace("-----END RSA PRIVATE KEY-----", "\n-----END RSA PRIVATE KEY-----");
    }

    return clean;
};

const AFIP_CERT = fixPem(process.env.AFIP_CERT);
const AFIP_KEY = fixPem(process.env.AFIP_KEY);

// Production mode: Defaults to TRUE unless explicitly set to 'false'
const AFIP_PRODUCTION = process.env.AFIP_PRODUCTION === 'false' ? false : true;

// Puntos de Venta Configuration
const AFIP_POS_PRODUCTOS = process.env.AFIP_POS_PRODUCTOS ? parseInt(process.env.AFIP_POS_PRODUCTOS) : 9;

const IVA_RATE_TO_ID: Record<number, number> = {
    0: 3,
    2.5: 9,
    5: 8,
    10.5: 4,
    21: 5,
    27: 6,
};

const IVA_ID_TO_RATE: Record<number, number> = {
    3: 0,
    4: 10.5,
    5: 21,
    6: 27,
    8: 5,
    9: 2.5,
};

const round2 = (value: number) => Number((Number.isFinite(value) ? value : 0).toFixed(2));

const toNumber = (value: unknown, fallback = 0) => {
    if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
    if (typeof value === "string") {
        const parsed = Number(value.replace(",", "."));
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
};

const CIGARETTE_IVA_BASE_FACTOR = 0.3;

const defaultVatForVoucher = (cbteTipo: number) => {
    if (cbteTipo === 1 || cbteTipo === 6) {
        return { id: 5, rate: 21 };
    }
    return { id: 3, rate: 0 };
};

const getCreditNoteTypeFromInvoice = (invoiceType: number) => {
    if (invoiceType === 1) return 3;   // FC-A -> NC-A
    if (invoiceType === 6) return 8;   // FC-B -> NC-B
    if (invoiceType === 11) return 13; // FC-C -> NC-C
    throw new Error(`Tipo de comprobante original no soportado para nota de crédito: ${invoiceType}`);
};

const resolveVatForItem = (item: InvoiceItemInput, cbteTipo: number) => {
    const fallback = defaultVatForVoucher(cbteTipo);

    if (!(cbteTipo === 1 || cbteTipo === 6)) {
        return fallback;
    }

    const itemIvaId = Math.trunc(toNumber(item.ivaId, 0));
    const itemIvaRate = toNumber(item.ivaRate, NaN);

    if (itemIvaId && IVA_ID_TO_RATE[itemIvaId] !== undefined) {
        return { id: itemIvaId, rate: IVA_ID_TO_RATE[itemIvaId] };
    }

    if (Number.isFinite(itemIvaRate)) {
        const normalizedRate = round2(itemIvaRate);
        const mappedId = IVA_RATE_TO_ID[normalizedRate];
        if (mappedId !== undefined) {
            return { id: mappedId, rate: normalizedRate };
        }
    }

    return fallback;
};

const isCigaretteCategory = (value: unknown) => String(value ?? "").trim().toLowerCase() === "cigarrillos";

const isCigaretteItem = (item: InvoiceItemInput) => {
    if (item.isCigarette) return true;
    return isCigaretteCategory(item.category);
};

const buildTaxBreakdown = (importe: number, cbteTipo: number, items: InvoiceItemInput[] = []) => {
    const hasTax = cbteTipo === 1 || cbteTipo === 6;
    if (!hasTax) {
        return {
            ivaSubtotals: [{ id: 3, rate: 0, base: round2(importe), amount: 0 }],
            tributeSubtotals: [] as TributeSubtotal[],
        };
    }

    if (!items.length) {
        const vat = defaultVatForVoucher(cbteTipo);
        const net = round2(importe / (1 + vat.rate / 100));
        const iva = round2(importe - net);
        return {
            ivaSubtotals: [{ id: vat.id, rate: vat.rate, base: net, amount: iva }],
            tributeSubtotals: [] as TributeSubtotal[],
        };
    }

    const ivaGrouped = new Map<number, IvaSubtotal>();
    const tributeGrouped = new Map<number, TributeSubtotal>();

    for (const item of items) {
        const qty = toNumber(item.quantity, 0);
        const price = toNumber(item.price, 0);
        if (qty <= 0 || price < 0) continue;

        const lineTotal = round2(qty * price);
        const vat = resolveVatForItem(item, cbteTipo);
        const isCigarette = isCigaretteItem(item);

        if (isCigarette && vat.rate > 0) {
            const ivaBase = round2(lineTotal * CIGARETTE_IVA_BASE_FACTOR);
            const ivaAmount = round2(ivaBase * (vat.rate / 100));
            const previousVat = ivaGrouped.get(vat.id) ?? { id: vat.id, rate: vat.rate, base: 0, amount: 0 };
            ivaGrouped.set(vat.id, {
                id: vat.id,
                rate: vat.rate,
                base: round2(previousVat.base + ivaBase),
                amount: round2(previousVat.amount + ivaAmount),
            });

            const noGravadoBase = round2(lineTotal - ivaBase - ivaAmount);
            if (noGravadoBase > 0) {
                const previousNoGravado = ivaGrouped.get(3) ?? { id: 3, rate: 0, base: 0, amount: 0 };
                ivaGrouped.set(3, {
                    id: 3,
                    rate: 0,
                    base: round2(previousNoGravado.base + noGravadoBase),
                    amount: 0,
                });
            }
            continue;
        }

        if (vat.rate > 0) {
            const lineNet = round2(lineTotal / (1 + vat.rate / 100));
            const ivaAmount = round2(lineTotal - lineNet);
            const previousVat = ivaGrouped.get(vat.id) ?? { id: vat.id, rate: vat.rate, base: 0, amount: 0 };
            ivaGrouped.set(vat.id, {
                id: vat.id,
                rate: vat.rate,
                base: round2(previousVat.base + lineNet),
                amount: round2(previousVat.amount + ivaAmount),
            });
            continue;
        }

        const previousVat = ivaGrouped.get(vat.id) ?? { id: vat.id, rate: vat.rate, base: 0, amount: 0 };
        ivaGrouped.set(vat.id, {
            id: vat.id,
            rate: vat.rate,
            base: round2(previousVat.base + lineTotal),
            amount: 0,
        });
    }

    const ivaSubtotals = Array.from(ivaGrouped.values());
    const tributeSubtotals = Array.from(tributeGrouped.values());

    if (!ivaSubtotals.length) {
        const vat = defaultVatForVoucher(cbteTipo);
        const net = round2(importe / (1 + vat.rate / 100));
        const iva = round2(importe - net);
        return {
            ivaSubtotals: [{ id: vat.id, rate: vat.rate, base: net, amount: iva }],
            tributeSubtotals,
        };
    }

    const sumBase = round2(ivaSubtotals.reduce((acc, curr) => acc + curr.base, 0));
    const sumIva = round2(ivaSubtotals.reduce((acc, curr) => acc + curr.amount, 0));
    const sumTrib = round2(tributeSubtotals.reduce((acc, curr) => acc + curr.amount, 0));
    const expectedNeto = round2(importe - sumIva - sumTrib);
    const baseDiff = round2(expectedNeto - sumBase);

    if (baseDiff !== 0) {
        const taxIndex = ivaSubtotals.findIndex((s) => s.rate > 0);
        const targetIndex = taxIndex >= 0 ? taxIndex : 0;
        ivaSubtotals[targetIndex] = {
            ...ivaSubtotals[targetIndex],
            base: round2(ivaSubtotals[targetIndex].base + baseDiff),
        };
    }

    return { ivaSubtotals, tributeSubtotals };
};

const buildIvaSubtotals = (importe: number, cbteTipo: number, items: InvoiceItemInput[] = []): IvaSubtotal[] => {
    return buildTaxBreakdown(importe, cbteTipo, items).ivaSubtotals;
};



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
            access_token: process.env.AFIP_SDK_ACCESS_TOKEN ?? ""
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
    cbteTipo: number = 6,
    items: InvoiceItemInput[] = [],
    fechaComprobante?: string
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

        const date = fechaComprobante ? new Date(`${fechaComprobante}T00:00:00`) : new Date();
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


        const { ivaSubtotals, tributeSubtotals } = buildTaxBreakdown(importe, cbteTipo, items);

        if (cbteTipo === 1 || cbteTipo === 6) {
            const totalIva = round2(ivaSubtotals.reduce((acc, curr) => acc + curr.amount, 0));
            const totalTrib = round2(tributeSubtotals.reduce((acc, curr) => acc + curr.amount, 0));
            const totalNeto = round2(importe - totalIva - totalTrib);

            data.ImpNeto = totalNeto;
            data.ImpIVA = totalIva;
            data.ImpTrib = totalTrib;
            data.ImpTotal = round2(totalNeto + totalIva + totalTrib);

            data.Iva = ivaSubtotals
                .filter((row) => row.rate > 0)
                .map((row) => ({
                    Id: row.id,
                    BaseImp: row.base,
                    Importe: row.amount,
                }));

            if (tributeSubtotals.length > 0) {
                data.Tributos = tributeSubtotals.map((row) => ({
                    Id: row.id,
                    Desc: row.description,
                    BaseImp: row.base,
                    Alic: row.rate,
                    Importe: row.amount,
                }));
            }
        } else {
            data.ImpNeto = round2(importe);
            data.ImpIVA = 0;
            data.ImpTrib = 0;
            data.ImpTotal = round2(importe);
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
            impTrib: data.ImpTrib || 0,
            ivaSubtotales: ivaSubtotals,
            tributos: (data.Tributos || []).map((row) => ({
                id: row.Id,
                description: row.Desc,
                base: row.BaseImp,
                rate: row.Alic,
                amount: row.Importe,
            })),
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
    puntoVenta?: number,
    tipoComprobanteAsociado: number = 11,
    puntoVentaAsociado?: number,
    ivaSubtotales: IvaSubtotal[] = []
) => {
    const afip = getAfipClient();
    if (!afip) throw new Error("AFIP no configurado");

    try {
        const ptoVta = puntoVenta || getPuntoVenta();
        const ptoVtaAsociado = puntoVentaAsociado || ptoVta;
        const tipoComprobante = getCreditNoteTypeFromInvoice(tipoComprobanteAsociado);

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
                    'Tipo': tipoComprobanteAsociado,
                    'PtoVta': ptoVtaAsociado,
                    'Nro': comprobanteAsociado
                }
            ]
        };

        if (tipoComprobante === 3 || tipoComprobante === 8) {
            const normalizedSubtotals = ivaSubtotales.length > 0
                ? ivaSubtotales
                : (() => {
                    const net = round2(importe / 1.21);
                    const iva = round2(importe - net);
                    return [{ id: 5, rate: 21, base: net, amount: iva }];
                })();

            const totalIva = round2(normalizedSubtotals.reduce((acc, curr) => acc + curr.amount, 0));
            const totalNeto = round2(importe - totalIva);

            data.ImpNeto = totalNeto;
            data.ImpIVA = totalIva;
            data.ImpTotal = round2(totalNeto + totalIva);
            data.Iva = normalizedSubtotals
                .filter((row) => row.rate > 0)
                .map((row) => ({
                    Id: row.id,
                    BaseImp: round2(row.base),
                    Importe: round2(row.amount),
                }));
        }

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
            tipoComprobanteAsociado,
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

const formatAfipDate = (raw?: unknown) => {
    if (!raw) return undefined;
    const dateStr = String(raw).trim();

    if (/^\d{8}$/.test(dateStr)) {
        return `${dateStr.slice(6, 8)}/${dateStr.slice(4, 6)}/${dateStr.slice(0, 4)}`;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const [y, m, d] = dateStr.split("-");
        return `${d}/${m}/${y}`;
    }

    return dateStr;
};

const asRecord = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== "object") return {};
    return value as Record<string, unknown>;
};

const getValueCI = (obj: unknown, key: string): unknown => {
    const record = asRecord(obj);
    const direct = record[key];
    if (direct !== undefined) return direct;

    const lowerKey = key.toLowerCase();
    for (const [k, v] of Object.entries(record)) {
        if (k.toLowerCase() === lowerKey) return v;
    }

    return undefined;
};

const pickPath = (obj: unknown, path: string[]): unknown => {
    let current: unknown = obj;

    for (const key of path) {
        current = getValueCI(current, key);
        if (current === undefined || current === null) return undefined;
    }

    return current;
};

const firstDefined = (obj: unknown, paths: string[][]): unknown => {
    for (const path of paths) {
        const value = pickPath(obj, path);
        if (value !== undefined && value !== null && String(value).trim() !== "") {
            return value;
        }
    }

    return undefined;
};

const buildAddress = (domicilio: Record<string, unknown> | undefined) => {
    if (!domicilio) return "-";

    const street = firstDefined(domicilio, [["direccion"], ["calle"], ["descCalle"]]);
    const number = firstDefined(domicilio, [["numero"], ["nro"], ["nroPuerta"]]);
    const streetWithNumber = [street, number].filter(Boolean).map((v) => String(v).trim()).join(" ").trim();

    const parts = [
        streetWithNumber,
        firstDefined(domicilio, [["localidad"], ["descripcionLocalidad"], ["descLocalidad"]]),
        firstDefined(domicilio, [["descripcionProvincia"], ["provincia"], ["descProvincia"]]),
    ]
        .map((part) => (part ? String(part).trim() : ""))
        .filter(Boolean);

    return parts.length > 0 ? parts.join(", ") : "-";
};

export const normalizeTaxpayerData = (persona: any, cuit: string): AfipBusinessProfile => {
    const datosGenerales = asRecord(firstDefined(persona, [["datosGenerales"], ["DatosGenerales"]]) || persona);
    const domicilioFiscal = asRecord(
        firstDefined(persona, [
            ["datosGenerales", "domicilioFiscal"],
            ["DatosGenerales", "domicilioFiscal"],
            ["datosGenerales", "DomicilioFiscal"],
            ["DatosGenerales", "DomicilioFiscal"],
            ["domicilioFiscal"],
            ["DomicilioFiscal"],
        ])
    );

    const razonSocial =
        String(
            firstDefined(persona, [
                ["datosGenerales", "razonSocial"],
                ["DatosGenerales", "razonSocial"],
                ["datosGenerales", "RazonSocial"],
                ["DatosGenerales", "RazonSocial"],
                ["razonSocial"],
                ["RazonSocial"],
            ]) ||
            [
                firstDefined(persona, [["datosGenerales", "apellido"], ["DatosGenerales", "apellido"], ["apellido"], ["Apellido"]]),
                firstDefined(persona, [["datosGenerales", "nombre"], ["DatosGenerales", "nombre"], ["nombre"], ["Nombre"]]),
            ].filter(Boolean).join(" ") ||
        process.env.NEXT_PUBLIC_BUSINESS_NAME ||
        "-"
        );

    const startActivity = formatAfipDate(
        firstDefined(persona, [
            ["datosGenerales", "fechaContratoSocial"],
            ["DatosGenerales", "fechaContratoSocial"],
            ["datosGenerales", "fechaInscripcion"],
            ["DatosGenerales", "fechaInscripcion"],
            ["datosGenerales", "FechaInscripcion"],
            ["DatosGenerales", "FechaInscripcion"],
            ["datosMonotributo", "actividadMonotributista", "fechaInicio"],
            ["datosRegimenGeneral", "actividad", "fechaInicio"],
        ])
    );

    const iibb =
        String(
        firstDefined(persona, [
            ["datosMonotributo", "impuesto", "descripcion"],
            ["datosMonotributo", "Impuesto", "descripcion"],
            ["datosRegimenGeneral", "impuesto", "descripcion"],
            ["datosRegimenGeneral", "Impuesto", "descripcion"],
            ["datosRegimenGeneral", "impuesto", "0", "descripcion"],
            ["datosRegimenGeneral", "Impuesto", "0", "descripcion"],
        ]) ||
        process.env.NEXT_PUBLIC_BUSINESS_IIBB ||
        ""
        ) || undefined;

    const hasMonotributo = !!firstDefined(persona, [["datosMonotributo"], ["DatosMonotributo"]]);
    const hasRegimenGeneral = !!firstDefined(persona, [["datosRegimenGeneral"], ["DatosRegimenGeneral"]]);

    const condition = hasMonotributo
        ? "Monotributista"
        : hasRegimenGeneral
            ? "Responsable Inscripto"
            : (persona.condicionIva || persona.condicion?.description || process.env.NEXT_PUBLIC_BUSINESS_CONDITION || "-");

    return {
        name: razonSocial,
        cuit: String(firstDefined(persona, [["idPersona"], ["IdPersona"], ["cuit"], ["CUIT"]]) || cuit),
        address: buildAddress(domicilioFiscal),
        startActivity,
        iibb,
        condition,
    };
};

export const getAfipBusinessProfile = async (): Promise<AfipBusinessProfile> => {
    const afip = getAfipClient();
    if (!afip) throw new Error("AFIP no configurado");

    const cuit = normalizeCuit(AFIP_CUIT || process.env.AFIP_CUIT || "");
    if (!cuit) {
        throw new Error("AFIP_CUIT no configurado");
    }

    if (cuit.length !== 11) {
        throw new Error("AFIP_CUIT invalido: debe tener 11 digitos");
    }

    const getPersona = async () => {
        const services = [
            afip.RegisterInscriptionProof,
            afip.RegisterScopeFive,
            afip.RegisterScopeFour,
            afip.RegisterScopeTen,
            afip.RegisterScopeThirteen,
        ].filter(Boolean);

        let lastError: unknown = null;

        const isRetriable = (error: unknown) => {
            const message = String((error as { message?: string })?.message || "").toLowerCase();
            if (!message) return false;
            if (message.includes("status code 400") || message.includes("status code 401") || message.includes("status code 403")) {
                return false;
            }
            return (
                message.includes("timeout") ||
                message.includes("etimedout") ||
                message.includes("econnreset") ||
                message.includes("eai_again") ||
                message.includes("network") ||
                message.includes("socket")
            );
        };

        for (const service of services) {
            try {
                const personaData = await service.getTaxpayerDetails(parseCuit(cuit));
                if (personaData) return personaData;
            } catch (error) {
                lastError = error;
                if (!isRetriable(error)) {
                    throw error;
                }
            }
        }

        if (lastError) throw lastError;
        throw new Error("No se pudo obtener datos del contribuyente en padrones AFIP");
    };

    const persona = await getPersona();
    return normalizeTaxpayerData(persona, cuit);
};
