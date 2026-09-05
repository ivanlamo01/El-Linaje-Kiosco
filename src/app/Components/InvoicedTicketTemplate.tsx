import React from "react";
import { formatCurrency } from "@/app/lib/utils/afipHelpers";
import { Sale } from "@/app/types/saleTypes";
import { BusinessData, InvoiceData } from "./InvoiceTemplate";
import QRCode from "react-qr-code";

interface InvoicedTicketTemplateProps {
    sale?: Sale;
    invoice: InvoiceData;
    businessData: BusinessData;
}

const formatDateFromAfip = (fecha?: string) => {
    if (!fecha || fecha.length !== 8) return "-";
    return `${fecha.slice(6, 8)}/${fecha.slice(4, 6)}/${fecha.slice(0, 4)}`;
};

const tipoLabel = (tipo?: number) => {
    switch (tipo) {
        case 1: return "Factura A";
        case 6: return "Factura B";
        case 11: return "Factura C";
        default: return `Comprobante ${tipo ?? ""}`;
    }
};

const letraLabel = (tipo?: number) => {
    switch (tipo) {
        case 1: return "A";
        case 6: return "B";
        case 11: return "C";
        default: return "X";
    }
};

export default function InvoicedTicketTemplate({ sale, invoice, businessData }: InvoicedTicketTemplateProps) {
    const fecha = invoice.fecha || invoice.cbteFch || "";
    const numero = `${String(invoice.puntoVenta || 0).padStart(5, "0")}-${String(invoice.nroComprobante || 0).padStart(8, "0")}`;
    const items = sale?.products || invoice.items || [];
    const total = invoice.impTotal ?? invoice.importe ?? sale?.total ?? 0;
    const paymentMethod = sale?.paymentMethod || "-";
    const otrosTributos = Number(invoice.impTrib || 0);

    const safeInt = (val: unknown) => {
        const clean = String(val ?? "").replace(/\D/g, "");
        const n = parseInt(clean, 10);
        return isNaN(n) ? 0 : n;
    };
    const safeNumber = (val: unknown) => {
        const clean = String(val ?? "").replace(/[^\d.,]/g, "").replace(",", ".");
        const n = Number(clean);
        return isNaN(n) ? 0 : n;
    };

    const qrUrl = invoice.cae && invoice.cbteFch ? (() => {
        try {
            const fechaStr = String(invoice.cbteFch);
            const fechaFormat = fechaStr.length === 8
                ? `${fechaStr.slice(0, 4)}-${fechaStr.slice(4, 6)}-${fechaStr.slice(6, 8)}`
                : fechaStr;
            const qrObj = {
                ver: 1, fecha: fechaFormat,
                cuit: safeInt(businessData.cuit),
                ptoVta: safeInt(invoice.puntoVenta),
                tipoCmp: safeInt(invoice.tipoComprobante),
                nroCmp: safeInt(invoice.nroComprobante),
                importe: safeNumber(invoice.impTotal || invoice.importe),
                moneda: "PES", ctz: 1,
                tipoDocRec: safeInt(invoice.docTipo),
                nroDocRec: safeInt(invoice.docNro),
                tipoCodAut: "E",
                codAut: safeInt(invoice.cae),
            };
            return `https://www.afip.gob.ar/fe/qr/?p=${btoa(JSON.stringify(qrObj))}`;
        } catch { return null; }
    })() : null;

    const ivaRows = invoice.ivaSubtotales || [];

    return (
        <div className="w-[72mm] max-w-[72mm] box-border p-2 bg-white text-black font-mono text-xs leading-tight mx-auto">
            {/* Cabecera */}
            <div className="text-center border-b border-black pb-2 mb-2">
                <p className="text-[10px] font-bold">COMPROBANTE AUTORIZADO</p>
                <h1 className="text-sm font-bold uppercase">{businessData.name}</h1>
                <p>{businessData.address}</p>
                <p>CUIT: {businessData.cuit}</p>
                <p>Cond. IVA: {businessData.condition}</p>
            </div>

            {/* Tipo y número */}
            <div className="text-center border-b border-black pb-2 mb-2">
                <p className="font-bold text-sm">{tipoLabel(invoice.tipoComprobante)} {letraLabel(invoice.tipoComprobante)}</p>
                <p>Nro: {numero}</p>
                <p>Fecha: {formatDateFromAfip(fecha)}</p>
            </div>

            {/* Receptor */}
            <div className="border-b border-black pb-2 mb-2">
                <p>Cliente: {invoice.nombre || "Consumidor Final"}</p>
                {invoice.docNro ? <p>Doc: {invoice.docNro}</p> : null}
            </div>

            {/* Productos */}
            <div className="mb-2">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-dotted border-black">
                            <th className="text-left font-normal w-1/2">Prod</th>
                            <th className="text-center font-normal">Cant</th>
                            <th className="text-right font-normal">$$</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((p, i) => (
                            <tr key={i}>
                                <td className="pt-1 pr-1 truncate max-w-[40mm]">{p.title}</td>
                                <td className="pt-1 text-center">{p.quantity}</td>
                                <td className="pt-1 text-right">{formatCurrency(Number(p.price) * Number(p.quantity))}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Totales */}
            <div className="border-t border-black pt-2 mb-2">
                {ivaRows.length > 0 && (
                    <div className="mb-1">
                        {ivaRows.map((r, i) => (
                            <div key={i} className="flex justify-between text-[10px]">
                                <span>Subtotal ({r.rate}%):</span>
                                <span>{formatCurrency(r.base)}</span>
                            </div>
                        ))}
                        {ivaRows.map((r, i) => (
                            <div key={`iva-${i}`} className="flex justify-between text-[10px]">
                                <span>IVA {r.rate}%:</span>
                                <span>{formatCurrency(r.amount)}</span>
                            </div>
                        ))}
                    </div>
                )}
                {otrosTributos > 0 ? (
                    <div className="flex justify-between text-[10px]">
                        <span>Otros trib.:</span>
                        <span>{formatCurrency(otrosTributos)}</span>
                    </div>
                ) : null}
                <div className="flex justify-between font-bold text-sm">
                    <span>TOTAL</span>
                    <span>{formatCurrency(total)}</span>
                </div>
                <div className="flex justify-between text-xs mt-1">
                    <span>Forma de Pago:</span>
                    <span>{paymentMethod}</span>
                </div>
            </div>

            {/* CAE */}
            <div className="border-t border-black pt-2 mb-2 text-[10px]">
                <p>CAE: {invoice.cae || "-"}</p>
                <p>Vto. CAE: {formatDateFromAfip(invoice.vencimientoCae)}</p>
            </div>

            {/* QR */}
            {qrUrl && (
                <div className="flex flex-col items-center mt-2 mb-2">
                    <QRCode value={qrUrl} size={80} />
                    <p className="text-[9px] mt-1 text-center">Comprobante verificable en ARCA</p>
                </div>
            )}

            {/* Footer */}
            <div className="text-center text-[10px] mt-2 border-t border-black pt-2">
                <p>¡Gracias por su compra!</p>
            </div>
        </div>
    );
}
