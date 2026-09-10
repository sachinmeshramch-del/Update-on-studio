const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
// Just use standard client if admin is not available, or tsx with firebase client
