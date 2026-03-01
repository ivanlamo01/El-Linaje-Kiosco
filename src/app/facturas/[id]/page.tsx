"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/app/config/firebase";
import InvoiceTemplate, { InvoiceData, BusinessData } from "@/app/Components/InvoiceTemplate";
import { FaArrowLeft, FaPrint } from "react-icons/fa";
import { useReactToPrint } from "react-to-print";

// Hardcoded business data or fetch from settings
const BUSINESS_DATA: BusinessData = {
    name: "LO DE MARTA",
    cuit: "20409378472", 
    address: "Calle AAA 123, Magdalena",
    startActivity: "01/01/2020",
    iibb: "20-40937847-2",
    condition: "Responsable Inscripto" // Assuming RI based on A/B requirement, or Monotributo
};

export default function InvoiceDetailPage() {
    const { id } = useParams() as { id: string };
    const router = useRouter();
    const [invoice, setInvoice] = useState<InvoiceData | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const componentRef = useRef<HTMLDivElement>(null);

    const handlePrint = useReactToPrint({
        contentRef: componentRef,
        documentTitle: `Factura-${invoice?.nroComprobante || '000'}`,
    });

    useEffect(() => {
        if (!id) return;

        const fetchInvoice = async () => {
            try {
                const docRef = doc(db, "facturas", id);
                const docSnap = await getDoc(docRef);
                
                if (docSnap.exists()) {
                    setInvoice(docSnap.data() as InvoiceData);
                } else {
                    setNotFound(true);
                }
            } catch (error) {
                console.error("Error obteniendo factura:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchInvoice();
    }, [id]);

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center text-foreground">
                <div className="text-xl font-semibold">Cargando factura...</div>
            </div>
        );
    }

    if (!invoice || notFound) {
        return (
            <div className="flex h-screen items-center justify-center text-foreground flex-col gap-4">
                <div className="text-xl font-semibold text-destructive">Factura no encontrada</div>
                <button onClick={() => router.back()} className="px-4 py-2 bg-secondary text-secondary-foreground rounded hover:bg-secondary/80">
                    Volver
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-8">
            <div className="max-w-4xl mx-auto">
                <div className="mb-6 flex justify-between items-center print:hidden">
                    <button 
                        onClick={() => router.back()} 
                        className="flex items-center gap-2 px-4 py-2 bg-card text-card-foreground border border-border rounded-lg shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                        <FaArrowLeft /> Volver
                    </button>
                    
                    <button 
                        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                        // @ts-ignore
                        onClick={handlePrint} 
                        className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg shadow hover:opacity-90 transition-colors"
                    >
                        <FaPrint /> Imprimir / PDF
                    </button>
                </div>

                <div className="overflow-auto flex justify-center pb-10 print:pb-0">
                    <div ref={componentRef} className="print:w-full print:absolute print:top-0 print:left-0">
                         <InvoiceTemplate data={invoice} businessData={BUSINESS_DATA} />
                    </div>
                </div>
            </div>
        </div>
    );
}
