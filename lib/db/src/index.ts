import { initializeApp } from 'firebase/app';
import { getFirestore, setLogLevel } from 'firebase/firestore';
setLogLevel('silent');
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPath = path.resolve(__dirname, '../../../firebase-applet-config.json');

let config: any = {};
if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

const app = initializeApp(config);
export const db = getFirestore(app, config.firestoreDatabaseId || '(default)');
export * from './schema/index';
export * from './dao';
export { updateTradeStopLoss } from './dao';
