const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./firebase-service-account.json');
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
db.settings({ databaseId: 'ai-studio-newupdate-e592ea8b-365a-4957-b176-b1d6a1a78904' });
db.collection('signals').orderBy('createdAt', 'desc').limit(5).get().then(snap => {
  snap.docs.forEach(doc => console.log(doc.id, doc.data()));
});
