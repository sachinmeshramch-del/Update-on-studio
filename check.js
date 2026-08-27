import fs from 'fs';
const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
console.log("Firebase config exists, ID:", config.projectId);
