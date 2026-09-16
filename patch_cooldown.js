const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let code = fs.readFileSync(file, 'utf8');

// 1. Add import
if (!code.includes('getSystemSettings')) {
    code = code.replace(
        'import { getLatestSignal, getRecentSignals, getRunningTrades } from "@workspace/db";',
        'import { getLatestSignal, getRecentSignals, getRunningTrades, getSystemSettings } from "@workspace/db";'
    );
}

// 2. Fetch settings inside calculateSignal
const target2 = `export async function calculateSignal(): Promise<SignalResult> {
  const now = Date.now();
  const smartMode = await isSmartMode();
  const analytics = await getAnalyticsSummary();
  const minConf = smartMode && analytics.sufficientData ? MIN_CONF_NORMAL + 5 : MIN_CONF_NORMAL;`;

const replace2 = `export async function calculateSignal(): Promise<SignalResult> {
  const now = Date.now();
  const smartMode = await isSmartMode();
  const sysSettings = await getSystemSettings();
  const disableCooldowns = sysSettings.disableCooldowns === true;
  const analytics = await getAnalyticsSummary();
  const minConf = smartMode && analytics.sufficientData ? MIN_CONF_NORMAL + 5 : MIN_CONF_NORMAL;`;

if (code.includes(target2)) {
    code = code.replace(target2, replace2);
}

// 3. Reset cooldown variables if disabled
const target3 = `    const inSpikeCooldown  = spikeDetectedAt > 0 && spikeElapsedMs < spikeCooldownMs;`;
const replace3 = `    let inSpikeCooldown  = spikeDetectedAt > 0 && spikeElapsedMs < spikeCooldownMs;
    if (disableCooldowns) inSpikeCooldown = false;`;

if (code.includes(target3)) {
    code = code.replace(target3, replace3);
}

const target4 = `    const inCooldown     = sinceLastSignal < COOLDOWN_MS;`;
const replace4 = `    let inCooldown     = sinceLastSignal < COOLDOWN_MS;
    if (disableCooldowns) inCooldown = false;`;

if (code.includes(target4)) {
    code = code.replace(target4, replace4);
}

const target5 = `    if (recentStops.inCircuitBreakerCooldown) {`;
const replace5 = `    if (recentStops.inCircuitBreakerCooldown && !disableCooldowns) {`;

if (code.includes(target5)) {
    code = code.replace(target5, replace5);
}

const target6 = `    if (finalSignal === "LONG" && recentStops.longDirectionCooldown) {`;
const replace6 = `    if (finalSignal === "LONG" && recentStops.longDirectionCooldown && !disableCooldowns) {`;

if (code.includes(target6)) {
    code = code.replace(target6, replace6);
}

const target7 = `    } else if (finalSignal === "SHORT" && recentStops.shortDirectionCooldown) {`;
const replace7 = `    } else if (finalSignal === "SHORT" && recentStops.shortDirectionCooldown && !disableCooldowns) {`;

if (code.includes(target7)) {
    code = code.replace(target7, replace7);
}

const target8 = `} else if (recentStops.inCircuitBreakerCooldown) {`;
const replace8 = `} else if (recentStops.inCircuitBreakerCooldown && !disableCooldowns) {`;

if (code.includes(target8)) {
    code = code.replace(target8, replace8);
}

fs.writeFileSync(file, code);
