const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, limit, query } = require('firebase/firestore');
const config = require('./firebase-applet-config.json');

const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

getDocs(query(collection(db, 'signals'), limit(1)))
  .then(snap => console.log('Docs:', snap.size))
  .catch(err => console.error('Error:', err.message));
