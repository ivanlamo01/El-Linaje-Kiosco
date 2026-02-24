export interface ParsedBarcode {
    type: 'standard' | 'weighted';
    productBarcode: string;
    weight?: number; // Weight in the unit provided by barcode (usually kg or grams depending on system, here we assume it matches price unit or needs conversion)
}

export const parseBarcode = (barcode: string): ParsedBarcode => {
    // Check for "20-CODE-WEIGHT" format (e.g. 20-12345-1.500)
    // Regex for: 20- followed by code, followed by weight (allowing decimals)
    const weightedRegex = /^20-(.+)-(.+)$/;
    const match = barcode.match(weightedRegex);

    if (match) {
        return {
            type: 'weighted',
            productBarcode: match[1],
            weight: parseFloat(match[2])
        };
    }

    return { type: 'standard', productBarcode: barcode };
};
