import { db } from "@workspace/db";
import { collection, getDocs, updateDoc, doc } from "firebase/firestore";

async function run() {
  const snap = await getDocs(collection(db, 'signals'));
  let fixedCount = 0;
  for (const d of snap.docs) {
    const data = d.data();
    if ((data.tradeStatus === 'TARGET_HIT' || data.tradeStatus === 'STOP_HIT' || data.tradeStatus === 'CLOSED' || data.tradeStatus === 'MANUALLY_CLOSED') && data.closedPrice != null && data.entryPrice != null) {
      const correctPnl = data.signal === "LONG" 
        ? data.closedPrice - data.entryPrice 
        : data.entryPrice - data.closedPrice;
      
      // Allow slight floating point differences, but fix large deviations
      if (data.pnlPoints == null || Math.abs(data.pnlPoints - correctPnl) > 0.01) {
        console.log(`Fixing trade ${d.id}: signal=${data.signal}, entry=${data.entryPrice}, close=${data.closedPrice}, old pnl=${data.pnlPoints}, new pnl=${Number(correctPnl.toFixed(2))}`);
        await updateDoc(doc(db, 'signals', d.id), {
          pnlPoints: Number(correctPnl.toFixed(2))
        });
        fixedCount++;
      }
    }
  }
  console.log(`Fixed ${fixedCount} trades.`);
  process.exit(0);
}
run();
