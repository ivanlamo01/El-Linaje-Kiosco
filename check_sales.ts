
import { getSalesByRange } from "./src/app/lib/sales";
import { db } from "./src/app/config/firebase";

async function checkSales() {
    const now = new Date();
    
    // Today
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);

    // Week (Start Sunday)
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); weekStart.setHours(0, 0, 0, 0);

    console.log("Checking sales...");
    console.log("Today Range:", todayStart, todayEnd);
    console.log("Week Range:", weekStart, todayEnd);

    try {
        const salesToday = await getSalesByRange(todayStart, todayEnd);
        console.log("Sales Today:", salesToday.length);
        
        const salesWeek = await getSalesByRange(weekStart, todayEnd);
        console.log("Sales Week:", salesWeek.length);

        if (salesWeek.length > 0) {
            console.log("Sample Sale Week:", JSON.stringify(salesWeek[0], null, 2));
        }

    } catch (e) {
        console.error("Error:", e);
    }
}

checkSales();
