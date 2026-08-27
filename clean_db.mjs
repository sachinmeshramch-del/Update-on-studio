import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId || '(default)');

async function main() {
  const q = query(collection(db, 'signals'), orderBy('createdAt', 'asc'));
  const snap = await getDocs(q);
  
  const signals = [];
  snap.forEach(d => {
    signals.push({ id: d.id, ...d.data() });
  });

  let deleted = 0;
  // keep track of active trades to find duplicates
  let runningSignals = {}; // direction -> timestamp

  for (let i = 0; i < signals.length; i++) {
    const s = signals[i];
    // Find if there's a trade in the same direction within 5 minutes
    // Or if it was a duplicate created by the zombie bug
    const prev = signals.slice(0, i).reverse().find(p => p.signal === s.signal && Math.abs(s.createdAt.toDate() - p.createdAt.toDate()) < 600000); // 10 minutes
    
    if (prev && s.createdAt.toDate() - prev.createdAt.toDate() < 300000) { // within 5 mins, it's a duplicate
        console.log(`Deleting duplicate signal ${s.id} (${s.signal}) created at ${s.createdAt.toDate()}`);
        await deleteDoc(doc(db, 'signals', s.id));
        deleted++;
    }
  }
  console.log(`Deleted ${deleted} duplicate signals.`);
}
main().catch(console.error).finally(() => process.exit(0));
