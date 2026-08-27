import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

getDocs(query(collection(db, 'signals'), limit(1)))
  .then(snap => console.log('Docs:', snap.size))
  .catch(err => console.error('Error:', err.message));
