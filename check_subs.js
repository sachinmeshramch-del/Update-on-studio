import { db } from './lib/db/src/index.js';
import { collection, getDocs } from 'firebase/firestore';

async function check() {
  const snap = await getDocs(collection(db, 'push_subscriptions'));
  console.log("Subscriptions found:", snap.size);
  process.exit(0);
}
check();
