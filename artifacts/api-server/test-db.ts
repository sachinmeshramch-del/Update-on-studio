
import { db } from "@workspace/db";
import { collection, query, orderBy, getDocs, limit, where } from "firebase/firestore";

async function run() {
  const q = query(collection(db, 'signals'), orderBy('createdAt', 'desc'), limit(15));
  const snap = await getDocs(q);
  snap.docs.forEach(d => {
    const data = d.data();
    console.log("ID:", d.id, "Status:", data.tradeStatus, "Date:", data.createdAt.toDate(), "Close Date:", data.closedAt ? data.closedAt.toDate() : null, "Reason:", data.reason, "SL:", data.stopLoss, "TP:", data.takeProfit, "Entry:", data.entryPrice, "Closed:", data.closedPrice, "PnL:", data.pnlPoints, "Type:", data.signal);
  });
}
run().catch(console.error).then(() => process.exit(0));
