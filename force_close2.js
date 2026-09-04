const { db } = require("/app/applet/lib/db/dist/index.js");
const { collection, query, where, getDocs, updateDoc } = require("firebase/firestore");

async function run() {
    try {
        const q = query(collection(db, "signals"), where("tradeStatus", "==", "RUNNING"));
        const snap = await getDocs(q);
        
        let closedCount = 0;
        for (const docSnap of snap.docs) {
            const data = docSnap.data();
            console.log(`Closing trade: ${docSnap.id}`);
            
            await updateDoc(docSnap.ref, {
                tradeStatus: "MANUALLY_CLOSED",
                closedAt: new Date(),
                closedPrice: data.entryPrice, 
                pnlPoints: 0
            });
            closedCount++;
        }
        console.log(`Successfully closed ${closedCount} running trades.`);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
run();
