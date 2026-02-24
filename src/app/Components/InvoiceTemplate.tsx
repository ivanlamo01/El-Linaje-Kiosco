
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
  nombre?: string;
  docNro?: number;
  docTipo?: number;
  importe?: number;

  impNeto?: number;
  impIVA?: number;
  impTotal?: number;

  cbteFch?: string;
  createdAt?: { toDate?: () => Date; seconds?: number };
  fecha?: string;
  items?: { title: string; quantity: number; price: number | string; description?: string }[];
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
      const safeNumber = (val: any) => {
        if (typeof val === 'number') return val;
        if (!val) return 0;
        // Remove everything that is not a digit or a dot/comma
        const clean = String(val).replace(/[^\d.,]/g, "").replace(",", ".");
        const num = Number(clean);
        return isNaN(num) ? 0 : num;
      };

      const safeInt = (val: any) => {
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
  const numero = `${String(data.puntoVenta || 0).padStart(4, "0")}-${String(data.nroComprobante || 0).padStart(8, "0")}`;

  return (
    <div className="w-[72mm] max-w-[72mm] p-2 bg-white text-black font-mono text-[11px] leading-tight mx-auto print:block">
      <div className="text-center border-b border-black pb-2 mb-2">
        <h1 className="text-sm font-bold uppercase">{businessData.name}</h1>
        <p>CUIT Nro.: {businessData.cuit || "-"}</p>
        {businessData.iibb && <p>Ing. Brutos: {businessData.iibb}</p>}
        <p>Dirección: {businessData.address}</p>
        {businessData.startActivity && <p>Inicio de actividades: {businessData.startActivity}</p>}
        {businessData.condition && <p>{businessData.condition}</p>}
        <p>{data.docTipo === 99 ? "A CONSUMIDOR FINAL" : ""}</p>
      </div>

      <div className="mb-2">
        <p>Cód. {String(data.tipoComprobante || "-")} - {comprobanteLabel}</p>
        <p>P.V. Nro. {String(data.puntoVenta || 0).padStart(4, "0")} - Nro. {String(data.nroComprobante || 0).padStart(8, "0")}</p>
        <div className="flex justify-between">
          <span>Fecha {formatDateFromAfip(fecha)}</span>
          {createdAtTime && <span>Hora {createdAtTime}</span>}
        </div>
      </div>

      <div className="border-t border-dotted border-black pt-2 mb-2">
        <p>{data.nombre || "Consumidor Final"}</p>
        <p>{getDocLabel(data.docTipo)}: {data.docNro || "-"}</p>
      </div>

      <div className="mb-2">
        <table className="w-full">
          <thead>
            <tr className="border-b border-dotted border-black">
              <th className="text-left font-normal">Detalle</th>
              <th className="text-center font-normal">Cant</th>
              <th className="text-right font-normal">Importe</th>
            </tr>
          </thead>
          <tbody>
            {(data.items && data.items.length > 0) ? (
              data.items.map((item, index) => (
                <tr key={index}>
                  <td className="pt-1 pr-1">
                    <div className="truncate max-w-[40mm]">{item.title}</div>
                    {item.description && <div className="text-[10px] text-gray-600">{item.description}</div>}
                  </td>
                  <td className="pt-1 text-center">{item.quantity}</td>
                  <td className="pt-1 text-right">
                    {formatCurrency(Number(item.price) * Number(item.quantity))}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="pt-1">Venta al contado</td>
                <td className="pt-1 text-center">1</td>
                <td className="pt-1 text-right">{formatCurrency(data.importe || 0)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="border-t border-black pt-2 mb-2">
        <div className="flex justify-between font-bold">
          <span>TOTAL</span>
          <span>{formatCurrency(data.impTotal || data.importe || 0)}</span>
        </div>
      </div>

      <div className="border-t border-black pt-2 mb-2">
        <p className="text-center font-bold">TRANSPARENCIA FISCAL</p>
        <div className="flex justify-between">
          <span>IVA contenido:</span>
          <span>{formatCurrency(data.impIVA || 0)}</span>
        </div>
        <div className="flex justify-between">
          <span>Otros Impuestos Nacionales</span>
          <span>{formatCurrency(0)}</span>
        </div>
        <div className="flex justify-between">
          <span>Indirectos:</span>
          <span>{formatCurrency(0)}</span>
        </div>
      </div>

      <div className="border-t border-black pt-2 mb-2">
        <p>CAE: {data.cae || "-"}</p>
        <p>Vto CAE: {formatDateFromAfip(data.vencimientoCae)}</p>
      </div>

      {qrUrl && (
        <div className="flex flex-col items-center gap-1">
          <QRCode
            size={120}

            value={qrUrl}
            viewBox={`0 0 256 256`}
          />
          <p className="text-[9px] text-center">Comprobante autorizado</p>
        </div>
      )}
    </div>
  );
}
