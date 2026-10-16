import { initializeApp } from 'firebase/app';
import { getFirestore, setLogLevel } from 'firebase/firestore';
setLogLevel('silent');
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const candidateConfigPaths = [
  path.resolve(process.cwd(), 'firebase-applet-config.json'),
  path.resolve(__dirname, '../../../firebase-applet-config.json'),
  path.resolve(__dirname, '../../firebase-applet-config.json'),
  path.resolve(__dirname, '../firebase-applet-config.json'),
  path.resolve(__dirname, './firebase-applet-config.json')
];

let config: any = {};

if (process.env.FIREBASE_APPLET_CONFIG) {
  try {
    config = JSON.parse(process.env.FIREBASE_APPLET_CONFIG);
  } catch (e) {
    console.warn("Failed to parse FIREBASE_APPLET_CONFIG from env:", e);
  }
}

if (!config.projectId) {
  for (const p of candidateConfigPaths) {
    if (fs.existsSync(p)) {
      try {
        config = JSON.parse(fs.readFileSync(p, 'utf8'));
        break;
      } catch {}
    }
  }
}

if (!config || !config.projectId) {
  config = {
    projectId: 'gold-swing-ai-demo',
    apiKey: 'demo-key',
    authDomain: 'gold-swing-ai-demo.firebaseapp.com'
  };
}

let app: any;
let db: any;

try {
  app = initializeApp(config);
  db = getFirestore(app, config.firestoreDatabaseId || '(default)');
} catch (e) {
  console.warn("[Firebase] Initialized with fallback config due to:", e);
}

export { db };
export * from './schema/index';
export * from './dao';
export { updateTradeStopLoss, updateTradeStopLossAndTakeProfit } from './dao';

