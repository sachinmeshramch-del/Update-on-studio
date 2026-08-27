const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const config = require('./firebase-applet-config.json');

const app = initializeApp({
  credential: applicationDefault(),
  // projectId: config.projectId // try without this first
});

const db = getFirestore(app, config.firestoreDatabaseId);

db.collection('signals').limit(1).get()
  .then(snap => console.log('Docs:', snap.size))
  .catch(err => console.error('Error:', err.message));
