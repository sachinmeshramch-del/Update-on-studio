const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, orderBy, limit, getDocs } = require('firebase/firestore');

const firebaseConfig = {
  projectId: "ai-studio-newupdate-e592ea8b-365a-4957-b176-b1d6a1a78904",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  const q = query(collection(db, 'signals'), orderBy('createdAt', 'desc'), limit(10));
  const snap = await getDocs(q);
  snap.docs.forEach(d => console.log(d.data()));
}
run().catch(console.error);
