import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import fs from 'fs';

const rawConfig = fs.readFileSync('./firebase-applet-config.json', 'utf8');
const config = JSON.parse(rawConfig);
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  const q = query(collection(db, "signals"), orderBy("createdAt", "desc"), limit(2));
  const snap = await getDocs(q);
  snap.forEach(doc => {
    const d = doc.data();
    console.log(d.trend1h, d.trend, d.signalType, d.reason);
  });
}
run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
