import { saleService } from "./services/saleService";
import { Sale } from "../types/saleTypes";

export async function getSalesByRange(start: Date, end: Date): Promise<Sale[]> {
    const result = await saleService.getByRange(start, end);
    if (!result.success || !result.data) {
        console.error("Error fetching sales:", result.error);
        return [];
    }
    return result.data;
}

export async function getLastSales(limit: number = 20): Promise<Sale[]> {
    const result = await saleService.getLast(limit);
    if (!result.success || !result.data) {
        console.error("Error fetching last sales:", result.error);
        return [];
    }
    return result.data;
}

export async function deleteSale(id: string): Promise<{ success: boolean; error?: string }> {
    return await saleService.delete(id);
}
