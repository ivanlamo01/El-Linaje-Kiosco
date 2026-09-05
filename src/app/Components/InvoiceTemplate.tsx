
import { formatCurrency } from "@/app/lib/utils/afipHelpers";
import QRCode from "react-qr-code";

export interface BusinessData {
  name: string;
  cuit: number | string;
  address: string;
  startActivity?: string;
  iibb?: string;
  condition?: string;
}

export interface InvoiceData {
  cae?: string;
  vencimientoCae?: string;
  nroComprobante?: number;
  puntoVenta?: number;
  tipoComprobante?: number;
  cbteTipo?: number;
  nombre?: string;
  docNro?: number;
  docTipo?: number;
  importe?: number;

  impNeto?: number;
  impIVA?: number;
  impTrib?: number;
  impTotal?: number;
  ivaSubtotales?: { id: number; rate: number; base: number; amount: number }[];
  tributos?: { id: number; description?: string; rate: number; base: number; amount: number }[];

  cbteFch?: string;
  createdAt?: { toDate?: () => Date; seconds?: number };
  fecha?: string;
  items?: {
    title: string;
    quantity: number | string;
    price: number | string;
    description?: string;
    ivaId?: number | string;
    ivaRate?: number | string;
  }[];
}

const formatDateFromAfip = (fecha?: string) => {
  if (!fecha || fecha.length !== 8) return "-";
  const y = fecha.slice(0, 4);
  const m = fecha.slice(4, 6);
  const d = fecha.slice(6, 8);
  return `${d}/${m}/${y}`;
};

const getDocLabel = (docTipo?: number) => {
  switch (docTipo) {
    case 80:
      return "CUIT";
    case 96:
      return "DNI";
    case 99:
      return "Consumidor Final";
    default:
      return "Documento";
  }
};

export default function InvoiceTemplate({
  data,
  businessData,
}: {
  data: InvoiceData;
  businessData: BusinessData;
}) {
  const fecha = data.fecha || data.cbteFch || "";
  const createdAtDate = data.createdAt?.seconds
    ? new Date(data.createdAt.seconds * 1000)
    : undefined;
  const createdAtTime = createdAtDate
    ? createdAtDate.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
    : "";

  const qrUrl = data.cae && data.cbteFch ? (() => {
    try {
      const fechaStr = String(data.cbteFch);
      const fechaFormat = fechaStr.length === 8
        ? `${fechaStr.substring(0, 4)}-${fechaStr.substring(4, 6)}-${fechaStr.substring(6, 8)}`
        : fechaStr;

      // Sanitize inputs
      const safeNumber = (val: unknown) => {
        if (typeof val === 'number') return val;
        if (!val) return 0;
        // Remove everything that is not a digit or a dot/comma
        const clean = String(val).replace(/[^\d.,]/g, "").replace(",", ".");
        const num = Number(clean);
        return isNaN(num) ? 0 : num;
      };

      const safeInt = (val: unknown) => {
        if (typeof val === 'number') return Math.floor(val);
        if (!val) return 0;
        // Remove everything that is not a digit
        const clean = String(val).replace(/[^\d]/g, "");
        const num = parseInt(clean, 10);
        return isNaN(num) ? 0 : num;
      }

      const qrObj = {
        ver: 1,
        fecha: fechaFormat,
        cuit: safeInt(businessData.cuit),
        ptoVta: safeInt(data.puntoVenta),
        tipoCmp: safeInt(data.tipoComprobante),
        nroCmp: safeInt(data.nroComprobante),
        importe: safeNumber(data.impTotal || data.importe),
        moneda: "PES",
        ctz: 1, // Tipo de cambio 1 para PES
        tipoDocRec: safeInt(data.docTipo),
        nroDocRec: safeInt(data.docNro),
        tipoCodAut: "E",
        codAut: safeInt(data.cae)
      };
      const json = JSON.stringify(qrObj);
      const b64 = btoa(json);
      return `https://www.afip.gob.ar/fe/qr/?p=${b64}`;
    } catch (e) { console.error("Error generating QR:", e); return null; }
  })() : null;

  let letra = "X";
  let tipoLabel = "Comprobante";

  switch (data.tipoComprobante) {
    case 1: letra = "A"; tipoLabel = "Factura A"; break;
    case 6: letra = "B"; tipoLabel = "Factura B"; break;
    case 11: letra = "C"; tipoLabel = "Factura C"; break;
    case 2: letra = "A"; tipoLabel = "Nota de Débito A"; break;
    case 3: letra = "A"; tipoLabel = "Nota de Crédito A"; break;
    case 7: letra = "B"; tipoLabel = "Nota de Débito B"; break;
    case 8: letra = "B"; tipoLabel = "Nota de Crédito B"; break;
    case 12: letra = "C"; tipoLabel = "Nota de Débito C"; break;
    case 13: letra = "C"; tipoLabel = "Nota de Crédito C"; break;
    default:
      // Fallback or explicit check if manually set
      if (data.tipoComprobante === 11) { letra = "C"; tipoLabel = "Factura C"; }
      else if (data.tipoComprobante === 13) { letra = "C"; tipoLabel = "Nota de Crédito C"; }
  }

  const comprobanteLabel = tipoLabel;
  const numero = `${String(data.puntoVenta || 0).padStart(5, "0")}-${String(data.nroComprobante || 0).padStart(8, "0")}`;
  const items = data.items || [];
  const subtotal = data.impNeto ?? data.importe ?? 0;
  const ivaTotal = data.impIVA ?? 0;
  const total = data.impTotal ?? data.importe ?? 0;
  const ivaRows = data.ivaSubtotales || [];
  const otrosTributos = data.impTrib ?? (data.tributos || []).reduce((acc, row) => acc + Number(row.amount || 0), 0);

  return (
    <div className="w-full max-w-[210mm] min-h-[297mm] p-8 bg-white text-black mx-auto border border-zinc-400 text-[12px] leading-[1.35] print:w-[210mm] print:min-h-[297mm] print:max-w-none print:border-0 print:p-[10mm]">
      <div className="border border-zinc-500">
        <div className="border-b border-zinc-500 py-2 text-center text-3xl font-bold tracking-wide">ORIGINAL</div>

        <div className="grid grid-cols-[1fr_auto_1fr] border-b border-zinc-500">
          <div className="p-4">
            <div className="text-2xl font-bold">{businessData.name}</div>
            <div className="mt-2">Razón Social: {businessData.name}</div>
            <div>CUIT: {businessData.cuit || "-"}</div>
            <div>Domicilio Comercial: {businessData.address || "-"}</div>
            <div>Inicio de Actividades: {businessData.startActivity || "-"}</div>
            <div>Ingresos Brutos: {businessData.iibb || "-"}</div>
            <div>Condición frente al IVA: {businessData.condition || "-"}</div>
          </div>

          <div className="border-x border-zinc-500 px-5 py-3 text-center flex flex-col items-center justify-center">
            <div className="text-5xl font-bold leading-none">{letra}</div>
            <div className="text-lg font-bold">COD. 00{data.tipoComprobante || data.cbteTipo || "-"}</div>
          </div>

          <div className="p-4 flex flex-col justify-center">
            <div className="text-4xl font-bold tracking-wide">FACTURA</div>
            <div className="mt-3 text-base font-semibold">Punto de Venta: {String(data.puntoVenta || 0).padStart(5, "0")}</div>
            <div className="text-base font-semibold">Comp. Nro: {String(data.nroComprobante || 0).padStart(8, "0")}</div>
            <div className="text-base font-semibold">Fecha Emisión: {formatDateFromAfip(fecha)}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 border-b border-zinc-500 p-4">
          <div>
            <div>DOC: {getDocLabel(data.docTipo)} {data.docNro || "-"}</div>
            <div>Condición frente al IVA: {data.docTipo === 99 ? "Consumidor Final" : getDocLabel(data.docTipo)}</div>
            <div>Condición de venta: Contado</div>
          </div>
          <div>
            <div>Cliente: {data.nombre || "Consumidor Final"}</div>
            <div>Domicilio: -</div>
            <div>Comprobante: {comprobanteLabel}</div>
          </div>
        </div>

        <table className="w-full border-b border-zinc-500">
          <thead>
            <tr className="border-b border-zinc-500 bg-zinc-100">
              <th className="text-left p-2 border-r border-zinc-400 w-[10%]">Código</th>
              <th className="text-left p-2 border-r border-zinc-400 w-[36%]">Producto / Servicio</th>
              <th className="text-right p-2 border-r border-zinc-400 w-[12%]">Cantidad</th>
              <th className="text-left p-2 border-r border-zinc-400 w-[10%]">U. Medida</th>
              <th className="text-right p-2 border-r border-zinc-400 w-[12%]">Precio Unit.</th>
              <th className="text-right p-2 border-r border-zinc-400 w-[8%]">% Bonif</th>
              <th className="text-right p-2 border-r border-zinc-400 w-[12%]">Imp. Bonif.</th>
              <th className="text-right p-2 w-[12%]">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items.length > 0 ? (
              items.map((item, index) => {
                const qty = Number(item.quantity || 0);
                const price = Number(item.price || 0);
                const lineTotal = qty * price;

                return (
                  <tr key={index} className="border-b border-zinc-200">
                    <td className="p-2 border-r border-zinc-200">{index + 1}</td>
                    <td className="p-2 border-r border-zinc-200">
                      <div>{item.title}</div>
                      {item.description && <div className="text-[11px] text-zinc-600">{item.description}</div>}
                    </td>
                    <td className="p-2 border-r border-zinc-200 text-right">{qty.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="p-2 border-r border-zinc-200">unidades</td>
                    <td className="p-2 border-r border-zinc-200 text-right">{formatCurrency(price)}</td>
                    <td className="p-2 border-r border-zinc-200 text-right">0,00</td>
                    <td className="p-2 border-r border-zinc-200 text-right">0,00</td>
                    <td className="p-2 text-right">{formatCurrency(lineTotal)}</td>
                  </tr>
                );
              })
            ) : (
              <tr className="border-b border-zinc-200">
                <td className="p-2 border-r border-zinc-200">1</td>
                <td className="p-2 border-r border-zinc-200">Venta al contado</td>
                <td className="p-2 border-r border-zinc-200 text-right">1,00</td>
                <td className="p-2 border-r border-zinc-200">unidades</td>
                <td className="p-2 border-r border-zinc-200 text-right">{formatCurrency(total)}</td>
                <td className="p-2 border-r border-zinc-200 text-right">0,00</td>
                <td className="p-2 border-r border-zinc-200 text-right">0,00</td>
                <td className="p-2 text-right">{formatCurrency(total)}</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="grid grid-cols-2 border-b border-zinc-500 min-h-[150px]">
          <div className="p-3 border-r border-zinc-500">
            <div className="font-semibold">Detalle de alícuotas IVA</div>
            {ivaRows.length > 0 ? (
              <table className="w-full mt-2 text-[11px]">
                <thead>
                  <tr className="border-b border-zinc-300">
                    <th className="text-left py-1">Alícuota</th>
                    <th className="text-right py-1">Base Imponible</th>
                    <th className="text-right py-1">IVA</th>
                  </tr>
                </thead>
                <tbody>
                  {ivaRows.map((row, index) => (
                    <tr key={`${row.id}-${index}`}>
                      <td className="py-1">{row.rate.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</td>
                      <td className="py-1 text-right">{formatCurrency(row.base)}</td>
                      <td className="py-1 text-right">{formatCurrency(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-[11px] mt-2">Sin discriminación de IVA para este tipo de comprobante.</div>
            )}
          </div>

          <div className="p-3 flex items-end justify-end">
            <div className="w-full max-w-[280px] text-right text-[24px] font-bold leading-tight">
              <div className="grid grid-cols-[1fr_auto] gap-x-4 text-[18px] font-semibold">
                <div>Subtotal:</div>
                <div>{formatCurrency(subtotal)}</div>
                <div>Importe Otros Tributos:</div>
                <div>{formatCurrency(otrosTributos)}</div>
                <div>Importe Total:</div>
                <div>{formatCurrency(total)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-b border-zinc-500 p-3">
          <div className="text-[22px] italic font-semibold">Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)</div>
          <div className="mt-2 text-[28px] font-bold">IVA Contenido: {formatCurrency(ivaTotal)}</div>
        </div>

        <div className="p-4">
          <div className="grid grid-cols-[120px_1fr] gap-4 items-start">
            {qrUrl ? (
              <div className="w-[108px] h-[108px] border border-zinc-300 p-1">
                <QRCode size={98} value={qrUrl} viewBox="0 0 256 256" />
              </div>
            ) : (
              <div className="w-[108px] h-[108px] border border-zinc-300" />
            )}

            <div className="flex flex-col gap-2">
              <div className="text-2xl font-bold">ARCA</div>
              <div className="text-[12px]">Comprobante Autorizado</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-2 text-[13px] font-semibold">
                <div>Pág. 1/1</div>
                <div>CAE N°: {data.cae || "-"}</div>
                <div>Comprobante: {numero}</div>
                <div>Fecha de Vto. de CAE: {formatDateFromAfip(data.vencimientoCae)}</div>
              </div>
              <div className="text-[10px] text-zinc-700 mt-1">Esta representación impresa corresponde a un comprobante electrónico autorizado por ARCA.</div>
            </div>
          </div>
        </div>
      </div>
      {createdAtTime && <div className="text-[10px] text-zinc-600 mt-2 text-right">Hora de emisión local: {createdAtTime}</div>}
    </div>
  );
}
