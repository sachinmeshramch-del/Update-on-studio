import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit as firestoreLimit } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId || '(default)');

async function main() {
  const q = query(collection(db, 'signals'), orderBy('createdAt', 'desc'), firestoreLimit(25));
  const snap = await getDocs(q);
  console.log(`Found ${snap.size} recent signals:`);
  snap.forEach(d => {
    const data = d.data();
    console.log(`${d.id} | ${data.signal} | ${data.tradeStatus} | Conf: ${data.confidence}% | Price: ${data.entryPrice} | Date: ${data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt} | Reason: ${data.reason}`);
  });
}
main().catch(console.error).finally(() => process.exit(0));
