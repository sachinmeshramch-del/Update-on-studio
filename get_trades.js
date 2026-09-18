import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import fs from 'fs';

const rawConfig = fs.readFileSync('./firebase-applet-config.json', 'utf8');
const config = JSON.parse(rawConfig);
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  const q = query(collection(db, "trades"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  if (snap.empty) {
    console.log("No running trades found.");
    return;
  }
  let c = 0;
  snap.forEach(doc => {
    if (c < 3) {
      console.log(doc.id, doc.data());
      c++;
    }
  });
}
run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
