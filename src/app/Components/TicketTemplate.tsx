import React from "react";
import { formatCurrency } from "@/app/lib/utils/afipHelpers";
import { Sale } from "@/app/types/saleTypes";
import { BusinessData } from "./InvoiceTemplate";

interface TicketTemplateProps {
  sale: Sale;
  businessData: BusinessData;
}

export default function TicketTemplate({ sale, businessData }: TicketTemplateProps) {
  const date = sale.date?.seconds 
    ? new Date(sale.date.seconds * 1000).toLocaleString('es-AR') 
    : '-';

  return (
    <div className="w-[72mm] max-w-[72mm] p-2 bg-white text-black font-mono text-xs leading-tight print:block hidden mx-auto">
      {/* Header */}
      <div className="text-center border-b border-black pb-2 mb-2">
        <h1 className="text-sm font-bold uppercase">{businessData.name}</h1>
        <p>{businessData.address}</p>
        <p>CUIT: {businessData.cuit}</p>
        <p>{businessData.condition}</p>
        <div className="mt-2">
            <p>TICKET DE VENTA</p>
            <p>Nro: {sale.id.slice(0, 8)}</p>
            <p>Fecha: {date}</p>
        </div>
      </div>

      {/* Items */}
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
            {sale.products.map((p, i) => (
              <tr key={i}>
                <td className="pt-1 pr-1 truncate max-w-[40mm]">{p.title}</td>
                <td className="pt-1 text-center">{p.quantity}</td>
                <td className="pt-1 text-right">{formatCurrency(Number(p.price) * Number(p.quantity))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="border-t border-black pt-2 mb-4">
         <div className="flex justify-between font-bold text-sm">
            <span>TOTAL</span>
            <span>{formatCurrency(sale.total)}</span>
        </div>
        <div className="flex justify-between text-xs mt-1">
            <span>Forma de Pago:</span>
            <span>{sale.paymentMethod}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-[10px] mt-4">
        <p>¡Gracias por su compra!</p>
        <p>Este comprobante no es válido como factura</p>
      </div>
    </div>
  );
}
