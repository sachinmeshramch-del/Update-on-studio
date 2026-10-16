const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

async function run() {
  // Try to use application default credentials or parse from env if configured
  // Since we are in the API server, it connects via Firebase Admin
  const path = require('path');
  const envPath = path.resolve('./artifacts/api-server/.env.local');
  if (fs.existsSync(envPath)) {
      require('dotenv').config({ path: envPath });
  }

  // Assuming it initializes via ADC inside the container
  const app = initializeApp();
  const db = getFirestore();
  const snapshot = await db.collection('signals').orderBy('createdAt', 'desc').limit(5).get();
  
  if (snapshot.empty) {
    console.log("No signals found in db.");
    return;
  }
  
  snapshot.forEach(doc => {
    const d = doc.data();
    console.log(`${d.createdAt ? d.createdAt.toDate().toISOString() : 'N/A'} - ${d.signal} - ${d.reason}`);
  });
}

run().catch(console.error);
