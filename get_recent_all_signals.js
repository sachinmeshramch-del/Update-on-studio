import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import fs from 'fs';

const rawConfig = fs.readFileSync('./firebase-applet-config.json', 'utf8');
const config = JSON.parse(rawConfig);
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  const q = query(collection(db, "signals"), orderBy("createdAt", "desc"), limit(5));
  const snap = await getDocs(q);
  if (snap.empty) {
    console.log("No signals found.");
    return;
  }
  snap.forEach(doc => {
    const d = doc.data();
    console.log(`[${d.createdAt ? new Date(d.createdAt.seconds * 1000).toISOString() : ''}] ${d.signal} @ ${d.entryPrice} - Status: ${d.tradeStatus} PNL: ${d.pnlPoints} - Reason: ${d.reason}`);
  });
}
run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
