const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, limit, query } = require('firebase/firestore');

const app = initializeApp({ projectId: "ai-studio-newupdate-e592ea8b-365a-4957-b176-b1d6a1a78904" });
const db = getFirestore(app);
async function run() {
  const snap = await getDocs(query(collection(db, 'settings'), limit(1)));
  if (snap.empty) { console.log("Empty"); return; }
  console.log(snap.docs[0].data());
}
run();
