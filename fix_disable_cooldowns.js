const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `export async function generateSignal(currentPrice: number, isCommit = false): Promise<SignalResult> {
  const now = Date.now();`;

const replace = `export async function generateSignal(currentPrice: number, isCommit = false): Promise<SignalResult> {
  const now = Date.now();
  const sysSettings = await getSystemSettings();
  const disableCooldowns = sysSettings.disableCooldowns === true;`;

if (code.includes(target) && !code.includes('const disableCooldowns = sysSettings.disableCooldowns')) {
    code = code.replace(target, replace);
    fs.writeFileSync(file, code);
}
