import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import fs from 'fs';

const rawConfig = fs.readFileSync('./firebase-applet-config.json', 'utf8');
const config = JSON.parse(rawConfig);
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  const q = query(collection(db, "trades"), where("tradeStatus", "==", "RUNNING"));
  const snap = await getDocs(q);
  if (snap.empty) {
    console.log("No RUNNING trades found in DB.");
  } else {
    snap.forEach(doc => {
      console.log(doc.id, JSON.stringify(doc.data(), null, 2));
    });
  }
}
run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
