"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/app/config/firebase";
import InvoiceTemplate, { InvoiceData, BusinessData } from "@/app/Components/InvoiceTemplate";
import InvoicedTicketTemplate from "@/app/Components/InvoicedTicketTemplate";
import { FaArrowLeft, FaPrint, FaReceipt } from "react-icons/fa";
import { useReactToPrint } from "react-to-print";

const FALLBACK_BUSINESS_DATA: BusinessData = {
    name: process.env.NEXT_PUBLIC_BUSINESS_NAME || "EL LINAJE KIOSKO",
    cuit: process.env.NEXT_PUBLIC_BUSINESS_CUIT || "No informado",
    address: process.env.NEXT_PUBLIC_BUSINESS_ADDRESS || "No informado",
    startActivity: process.env.NEXT_PUBLIC_BUSINESS_START_ACTIVITY || "No informado",
    iibb: process.env.NEXT_PUBLIC_BUSINESS_IIBB || "No informado",
    condition: process.env.NEXT_PUBLIC_BUSINESS_CONDITION || "Responsable Monotributo",
};

export default function InvoiceDetailPage() {
    const { id } = useParams() as { id: string };
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialViewMode = searchParams.get("view") === "ticket" ? "ticket" : "invoice";
    const [invoice, setInvoice] = useState<InvoiceData | null>(null);
    const [businessData, setBusinessData] = useState<BusinessData>(FALLBACK_BUSINESS_DATA);
    const [viewMode, setViewMode] = useState<"invoice" | "ticket">(initialViewMode);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const componentRef = useRef<HTMLDivElement>(null);

    const handlePrint = useReactToPrint({
        contentRef: componentRef,
        documentTitle: `${viewMode === "ticket" ? "Ticket" : "Factura"}-${invoice?.nroComprobante || '000'}`,
    });

    useEffect(() => {
        if (!id) return;
        const invoiceId = id === "ver" ? searchParams.get("id") : id;
        if (!invoiceId) {
            setNotFound(true);
            setLoading(false);
            return;
        }

        const fetchInvoice = async () => {
            try {
                const docRef = doc(db, "facturas", invoiceId);
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
    }, [id, searchParams]);

    useEffect(() => {
        const fetchBusinessData = async () => {
            try {
                const loadProfile = async (force = false) => {
                    const url = force ? "/api/afip/business-profile?force=1" : "/api/afip/business-profile";
                    const response = await fetch(url, { cache: "no-store" });
                    const payload = await response.json();

                    if (response.ok && payload?.success && payload?.data) {
                        setBusinessData(payload.data as BusinessData);
                        return payload?.meta?.source === "afip";
                    }

                    return false;
                };

                const fromAfip = await loadProfile(false);

                // If first response is fallback, try one forced refresh.
                if (!fromAfip) {
                    await loadProfile(true);
                }
            } catch (error) {
                console.warn("No se pudo obtener perfil fiscal de AFIP, se usan datos fallback", error);
            }
        };

        fetchBusinessData();
    }, []);

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-background text-foreground">
                <div className="text-xl font-semibold">Cargando factura...</div>
            </div>
        );
    }

    if (!invoice || notFound) {
        return (
            <div className="flex h-screen items-center justify-center bg-background text-foreground flex-col gap-4">
                <div className="text-xl font-semibold text-destructive">Factura no encontrada</div>
                <button onClick={() => router.back()} className="px-4 py-2 bg-secondary text-secondary-foreground rounded hover:bg-secondary/80">
                    Volver
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background p-4 md:p-8">
            <div className="max-w-[220mm] mx-auto">
                <div className="mb-6 flex justify-between items-center print:hidden">
                    <button 
                        onClick={() => router.back()} 
                        className="flex items-center gap-2 px-4 py-2 bg-card text-card-foreground border border-border rounded-lg shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                        <FaArrowLeft /> Volver
                    </button>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setViewMode(viewMode === "invoice" ? "ticket" : "invoice")}
                            className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg shadow-sm hover:bg-secondary/80 transition-colors"
                        >
                            <FaReceipt /> {viewMode === "invoice" ? "Ver Ticket" : "Ver Factura"}
                        </button>

                        <button 
                            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                            // @ts-ignore
                            onClick={handlePrint} 
                            className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg shadow hover:opacity-90 transition-colors"
                        >
                            <FaPrint /> {viewMode === "ticket" ? "Imprimir Ticket" : "Imprimir / PDF"}
                        </button>
                    </div>
                </div>



                <div className="overflow-auto flex justify-center pb-10 print:pb-0">
                    <div ref={componentRef} className={viewMode === "ticket" ? "w-full flex justify-center" : "w-full print:w-[210mm] print:mx-0 print:my-0"}>
                        {viewMode === "ticket" ? (
                            <InvoicedTicketTemplate invoice={invoice} businessData={businessData} />
                        ) : (
                            <InvoiceTemplate data={invoice} businessData={businessData} />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
