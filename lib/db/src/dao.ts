import { db } from './index';
import { Signal, InsertSignal, PushSubscription, HermesHypothesis, HermesParameters } from './schema/index';
import { collection, query, where, getDocs, getDoc, addDoc, updateDoc, doc, deleteDoc, orderBy, limit, writeBatch } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

const CACHE_FILE = path.resolve(process.cwd(), '.signals_cache.json');

async function withTimeout<T>(promise: Promise<T>, ms = 1500): Promise<T> {
  let timer: any;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Firestore operation timed out')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

let localSignalsCache: Signal[] = [];

function loadLocalSignals(): void {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const seenBrokerIds = new Set<string>();
        const deduped: any[] = [];
        for (const item of parsed) {
          if (item.brokerPositionId) {
            const key = String(item.brokerPositionId);
            if (seenBrokerIds.has(key)) continue;
            seenBrokerIds.add(key);
          }
          deduped.push(item);
        }
        localSignalsCache = deduped.map((item: any) => ({
          ...item,
          createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
          closedAt: item.closedAt ? new Date(item.closedAt) : null,
        }));
        return;
      }
    }
  } catch (e) {
    console.warn("[DB] Failed reading local signals cache:", e);
  }
}

function saveLocalSignals(): void {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(localSignalsCache, null, 2), 'utf8');
  } catch (e) {
    console.warn("[DB] Failed writing local signals cache:", e);
  }
}

export async function insertPushSubscription(endpoint: string, p256dh: string, auth: string): Promise<void> {
  const q = query(collection(db, 'push_subscriptions'), where('endpoint', '==', endpoint));
  const snap = await withTimeout(getDocs(q), 1500).catch(() => null);
  if (snap && snap.empty) {
    await withTimeout(addDoc(collection(db, 'push_subscriptions'), {
      endpoint, p256dh, auth, createdAt: new Date()
    }), 1500).catch(() => null);
  } else if (snap && !snap.empty) {
    await withTimeout(updateDoc(snap.docs[0].ref, { p256dh, auth }), 1500).catch(() => null);
  }
}

export async function getPushSubscriptions(): Promise<PushSubscription[]> {
  const snap = await withTimeout(getDocs(collection(db, 'push_subscriptions')), 1500).catch(() => null);
  if (!snap) return [];
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as PushSubscription));
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  const q = query(collection(db, 'push_subscriptions'), where('endpoint', '==', endpoint));
  const snap = await withTimeout(getDocs(q), 1500).catch(() => null);
  if (snap) {
    for (const d of snap.docs) {
      await withTimeout(deleteDoc(d.ref), 1500).catch(() => null);
    }
  }
}

export async function getLatestSignal(): Promise<Signal | null> {
  if (localSignalsCache.length > 0) return localSignalsCache[0];
  return null;
}

export async function getRunningTrades(): Promise<Signal[]> {
  return localSignalsCache.filter(s => s.tradeStatus === 'RUNNING');
}

export async function updateTradeStatus(id: string, tradeStatus: string, closedPrice: number, pnlPoints: number): Promise<void> {
  const item = localSignalsCache.find(s => s.id === id);
  if (item) {
    item.tradeStatus = tradeStatus;
    item.closedPrice = closedPrice;
    item.pnlPoints = pnlPoints;
    item.closedAt = new Date();
    saveLocalSignals();
  }
  withTimeout(updateDoc(doc(db, 'signals', id), {
    tradeStatus, closedPrice, pnlPoints, closedAt: new Date()
  }), 1500).catch(() => null);
}

export async function getClosedTrades(limitCount: number): Promise<Signal[]> {
  return localSignalsCache.filter(s => s.tradeStatus !== 'RUNNING').slice(0, limitCount);
}

export async function insertSignal(signalData: InsertSignal & { createdAt?: Date }): Promise<void> {
  const createdAt = (signalData as any).createdAt ? new Date((signalData as any).createdAt) : new Date();
  const closedAt = (signalData as any).closedAt ? new Date((signalData as any).closedAt) : ((signalData as any).closedAt ?? null);

  if (signalData.brokerPositionId) {
    const existingIdx = localSignalsCache.findIndex(s => s.brokerPositionId && String(s.brokerPositionId) === String(signalData.brokerPositionId));
    if (existingIdx !== -1) {
      localSignalsCache[existingIdx] = {
        ...localSignalsCache[existingIdx],
        ...signalData,
        createdAt: localSignalsCache[existingIdx].createdAt || createdAt,
        closedAt: closedAt || localSignalsCache[existingIdx].closedAt,
      } as Signal;
      saveLocalSignals();
      return;
    }
  }

  const id = `sig-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const newSig: Signal = {
    ...signalData,
    id,
    createdAt,
    closedAt,
  } as Signal;
  localSignalsCache.unshift(newSig);
  localSignalsCache.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  saveLocalSignals();

  withTimeout(addDoc(collection(db, 'signals'), {
    ...signalData,
    createdAt,
    closedAt,
  }), 1500).catch(() => null);
}

export async function insertMultipleSignals(signalsList: (InsertSignal & { createdAt?: Date })[]): Promise<number> {
  if (!signalsList || signalsList.length === 0) return 0;
  const now = Date.now();
  const added: Signal[] = signalsList.map((item, idx) => ({
    ...item,
    id: `import-${now}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: item.createdAt ? new Date(item.createdAt) : new Date(now - idx * 1000),
    closedAt: item.closedAt ? new Date(item.closedAt) : null,
  } as Signal));

  localSignalsCache.unshift(...added);
  localSignalsCache.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  saveLocalSignals();

  // Background non-blocking sync to Firestore
  (async () => {
    try {
      const chunkSize = 200;
      for (let i = 0; i < signalsList.length; i += chunkSize) {
        const chunk = signalsList.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        for (const item of chunk) {
          const docRef = doc(collection(db, 'signals'));
          batch.set(docRef, { ...item, createdAt: item.createdAt || new Date() });
        }
        await withTimeout(batch.commit(), 2500);
      }
    } catch {
      // Offline fallback: cache has it
    }
  })().catch(() => null);

  return added.length;
}

export async function seedHistoricalTrades(): Promise<number> {
  // Pre-seed realistic historical weekday trades during live market sessions (Friday/Thursday/Wednesday)
  // Ensures no trades are ever seeded during market closures (weekends)
  const sampleTrades = [
    {
      signal: "SHORT",
      confidence: 78,
      entryPrice: 4145.08,
      stopLoss: 4151.78,
      takeProfit: 4130.93,
      trend: "BEARISH",
      reason: "Confluence of 1H EMA bearish alignment + RSI oversold recovery",
      tradeDuration: "45m",
      createdAt: new Date("2026-10-16T15:30:00.000Z"), // Friday NY Session
      tradeStatus: "STOP_HIT",
      closedPrice: 4151.78,
      closedAt: new Date("2026-10-16T16:15:00.000Z"),
      pnlPoints: -6.70,
      signalType: "TREND_FOLLOW",
      isRealTrade: false,
      brokerPositionId: null,
      executionStatus: "NOT_EXECUTED",
      executionType: "SIMULATED",
      executionReason: "Historical Signal (Simulated Baseline)"
    },
    {
      signal: "LONG",
      confidence: 84,
      entryPrice: 4138.50,
      stopLoss: 4131.20,
      takeProfit: 4155.00,
      trend: "BULLISH",
      reason: "Liquidity sweep at 4132 support level + bullish engulfing 15m candle",
      tradeDuration: "1h 20m",
      createdAt: new Date("2026-10-16T13:45:00.000Z"), // Friday London/NY Overlap
      tradeStatus: "TARGET_HIT",
      closedPrice: 4155.00,
      closedAt: new Date("2026-10-16T15:05:00.000Z"),
      pnlPoints: 16.50,
      signalType: "TREND_FOLLOW",
      isRealTrade: false,
      brokerPositionId: null,
      executionStatus: "NOT_EXECUTED",
      executionType: "SIMULATED",
      executionReason: "Historical Signal (Simulated Baseline)"
    },
    {
      signal: "SHORT",
      confidence: 62,
      entryPrice: 4152.10,
      stopLoss: 4158.80,
      takeProfit: 4138.00,
      trend: "NEUTRAL",
      reason: "Asian session upper range bounce rejection at key resistance",
      tradeDuration: "38m",
      createdAt: new Date("2026-10-16T03:30:00.000Z"), // Friday Asian Session
      tradeStatus: "STOP_HIT",
      closedPrice: 4158.80,
      closedAt: new Date("2026-10-16T04:08:00.000Z"),
      pnlPoints: -6.70,
      signalType: "REVERSAL",
      isRealTrade: false,
      brokerPositionId: null,
      executionStatus: "NOT_EXECUTED",
      executionType: "SIMULATED",
      executionReason: "Historical Signal (Simulated Baseline)"
    },
    {
      signal: "LONG",
      confidence: 86,
      entryPrice: 4125.40,
      stopLoss: 4118.20,
      takeProfit: 4142.10,
      trend: "BULLISH",
      reason: "NY Session momentum expansion above 1H EMA50 confluence",
      tradeDuration: "2h 15m",
      createdAt: new Date("2026-10-15T16:00:00.000Z"), // Thursday NY ORB Trigger
      tradeStatus: "TARGET_HIT",
      closedPrice: 4142.10,
      closedAt: new Date("2026-10-15T18:15:00.000Z"),
      pnlPoints: 16.70,
      signalType: "TREND_FOLLOW",
      isRealTrade: false,
      brokerPositionId: null,
      executionStatus: "NOT_EXECUTED",
      executionType: "SIMULATED",
      executionReason: "Historical Signal (Simulated Baseline)"
    },
    {
      signal: "SHORT",
      confidence: 64,
      entryPrice: 4148.90,
      stopLoss: 4154.50,
      takeProfit: 4132.00,
      trend: "BEARISH",
      reason: "London/NY crossover supply zone rejection setup",
      tradeDuration: "52m",
      createdAt: new Date("2026-10-15T12:30:00.000Z"), // Thursday London Session
      tradeStatus: "STOP_HIT",
      closedPrice: 4154.50,
      closedAt: new Date("2026-10-15T13:22:00.000Z"),
      pnlPoints: -5.60,
      signalType: "RANGE_BOUNCE",
      isRealTrade: false,
      brokerPositionId: null,
      executionStatus: "NOT_EXECUTED",
      executionType: "SIMULATED",
      executionReason: "Historical Signal (Simulated Baseline)"
    },
    {
      signal: "LONG",
      confidence: 82,
      entryPrice: 4118.80,
      stopLoss: 4111.50,
      takeProfit: 4135.00,
      trend: "BULLISH",
      reason: "London session breakout above 15m Fair Value Gap",
      tradeDuration: "1h 40m",
      createdAt: new Date("2026-10-15T08:15:00.000Z"), // Thursday London Open
      tradeStatus: "TARGET_HIT",
      closedPrice: 4135.00,
      closedAt: new Date("2026-10-15T09:55:00.000Z"),
      pnlPoints: 16.20,
      signalType: "TREND_FOLLOW",
      isRealTrade: false,
      brokerPositionId: null,
      executionStatus: "NOT_EXECUTED",
      executionType: "SIMULATED",
      executionReason: "Historical Signal (Simulated Baseline)"
    },
    {
      signal: "LONG",
      confidence: 88,
      entryPrice: 4110.20,
      stopLoss: 4103.50,
      takeProfit: 4128.50,
      trend: "BULLISH",
      reason: "Hermes Engine A high confluence SMC Order Block bounce",
      tradeDuration: "2h 05m",
      createdAt: new Date("2026-10-14T14:30:00.000Z"), // Wednesday NY Session
      tradeStatus: "TARGET_HIT",
      closedPrice: 4128.50,
      closedAt: new Date("2026-10-14T16:35:00.000Z"),
      pnlPoints: 18.30,
      signalType: "TREND_FOLLOW",
      isRealTrade: false,
      brokerPositionId: null,
      executionStatus: "NOT_EXECUTED",
      executionType: "SIMULATED",
      executionReason: "Historical Signal (Simulated Baseline)"
    },
    {
      signal: "SHORT",
      confidence: 81,
      entryPrice: 4135.60,
      stopLoss: 4142.00,
      takeProfit: 4118.00,
      trend: "BEARISH",
      reason: "Deterministic ORB 3H NY Range low breakdown expansion",
      tradeDuration: "1h 50m",
      createdAt: new Date("2026-10-14T16:00:00.000Z"), // Wednesday NY ORB Breakout
      tradeStatus: "TARGET_HIT",
      closedPrice: 4118.00,
      closedAt: new Date("2026-10-14T17:50:00.000Z"),
      pnlPoints: 17.60,
      signalType: "TREND_FOLLOW",
      isRealTrade: false,
      brokerPositionId: null,
      executionStatus: "NOT_EXECUTED",
      executionType: "SIMULATED",
      executionReason: "Historical Signal (Simulated Baseline)"
    },
    {
      signal: "LONG",
      confidence: 85,
      entryPrice: 4095.10,
      stopLoss: 4088.00,
      takeProfit: 4112.80,
      trend: "BULLISH",
      reason: "Bullish market structure break (BOS) on 15m timeframe",
      tradeDuration: "2h 30m",
      createdAt: new Date("2026-10-13T15:00:00.000Z"), // Tuesday NY Session
      tradeStatus: "TARGET_HIT",
      closedPrice: 4112.80,
      closedAt: new Date("2026-10-13T17:30:00.000Z"),
      pnlPoints: 17.70,
      signalType: "TREND_FOLLOW",
      isRealTrade: false,
      brokerPositionId: null,
      executionStatus: "NOT_EXECUTED",
      executionType: "SIMULATED",
      executionReason: "Historical Signal (Simulated Baseline)"
    },
    {
      signal: "SHORT",
      confidence: 71,
      entryPrice: 4108.30,
      stopLoss: 4115.00,
      takeProfit: 4091.00,
      trend: "BEARISH",
      reason: "Trailing stop secured profit after +5.8 pts pullback",
      tradeDuration: "1h 10m",
      createdAt: new Date("2026-10-13T09:30:00.000Z"), // Tuesday London Session
      tradeStatus: "CLOSED",
      closedPrice: 4102.50,
      closedAt: new Date("2026-10-13T10:40:00.000Z"),
      pnlPoints: 5.80,
      signalType: "RANGE_BOUNCE",
      isRealTrade: false,
      brokerPositionId: null,
      executionStatus: "NOT_EXECUTED",
      executionType: "SIMULATED",
      executionReason: "Historical Signal (Simulated Baseline)"
    }
  ];

  loadLocalSignals();
  if (localSignalsCache.length === 0) {
    localSignalsCache = sampleTrades.map((t, idx) => ({
      ...t,
      id: `seed-${idx}-${Date.now()}`
    } as Signal));
    saveLocalSignals();
  }

  return sampleTrades.length;
}

// Immediately load cache or seed upon startup
loadLocalSignals();
if (localSignalsCache.length === 0) {
  seedHistoricalTrades().catch(() => null);
}

export async function getRecentSignals(limitCount: number): Promise<Signal[]> {
  if (localSignalsCache.length === 0) {
    await seedHistoricalTrades();
  }
  return localSignalsCache.slice(0, limitCount);
}

export async function deleteSignalById(id: string): Promise<boolean> {
  const initialLen = localSignalsCache.length;
  localSignalsCache = localSignalsCache.filter(s => s.id !== id);
  if (localSignalsCache.length !== initialLen) {
    saveLocalSignals();
  }
  withTimeout(deleteDoc(doc(db, 'signals', id)), 1500).catch(() => null);
  return true;
}

export async function clearAllHistory(): Promise<number> {
  const count = localSignalsCache.length;
  localSignalsCache = [];
  saveLocalSignals();
  (async () => {
    try {
      const snap = await withTimeout(getDocs(collection(db, 'signals')), 1500);
      if (snap && !snap.empty) {
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        await withTimeout(batch.commit(), 2500);
      }
    } catch {}
  })().catch(() => null);
  return count;
}

export async function clearSimulatedBacktestTrades(): Promise<number> {
  const initialLen = localSignalsCache.length;
  localSignalsCache = localSignalsCache.filter(s =>
    s.executionType !== "SIMULATED" &&
    s.isRealTrade !== false &&
    !String(s.reason || "").includes("Backtest") &&
    !String(s.executionReason || "").includes("Backtest")
  );
  const removed = initialLen - localSignalsCache.length;
  if (removed > 0) {
    saveLocalSignals();
  }
  return removed;
}

export async function updateTradeStopLoss(id: string, stopLoss: number): Promise<void> {
  const item = localSignalsCache.find(s => s.id === id);
  if (item) {
    item.stopLoss = stopLoss;
    saveLocalSignals();
  }
  withTimeout(updateDoc(doc(db, 'signals', id), { stopLoss }), 1500).catch(() => null);
}

export async function updateTradeStopLossAndTakeProfit(id: string, stopLoss: number, takeProfit: number): Promise<void> {
  const item = localSignalsCache.find(s => s.id === id);
  if (item) {
    item.stopLoss = stopLoss;
    item.takeProfit = takeProfit;
    saveLocalSignals();
  }
  withTimeout(updateDoc(doc(db, 'signals', id), { stopLoss, takeProfit }), 1500).catch(() => null);
}

export async function updateTradeEntryPrice(id: string, entryPrice: number): Promise<void> {
  const item = localSignalsCache.find(s => s.id === id);
  if (item) {
    item.entryPrice = entryPrice;
    saveLocalSignals();
  }
  withTimeout(updateDoc(doc(db, 'signals', id), { entryPrice }), 1500).catch(() => null);
}

import { SystemSettings } from './schema/index';
import { setDoc } from 'firebase/firestore';

const SETTINGS_FILE_NAME = '.settings_cache.json';

function getSettingsFilePath(): string {
  const possiblePaths = [
    path.resolve(process.cwd(), SETTINGS_FILE_NAME),
    path.resolve(process.cwd(), 'artifacts/api-server', SETTINGS_FILE_NAME),
    path.resolve('/app/applet/artifacts/api-server', SETTINGS_FILE_NAME),
    path.resolve('/app/applet', SETTINGS_FILE_NAME),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(path.dirname(p))) return p;
    } catch {}
  }
  return path.resolve(process.cwd(), SETTINGS_FILE_NAME);
}

function loadLocalSettings(): Partial<SystemSettings> | null {
  try {
    const file = getSettingsFilePath();
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed as Partial<SystemSettings>;
      }
    }
  } catch (e) {
    console.warn('[DB] Failed reading local settings cache:', e);
  }
  return null;
}

function saveLocalSettings(settings: SystemSettings): void {
  try {
    const file = getSettingsFilePath();
    fs.writeFileSync(file, JSON.stringify(settings, null, 2), 'utf8');
  } catch (e) {
    console.warn('[DB] Failed writing local settings cache:', e);
  }
}

let cachedSettings: SystemSettings | null = null;
let lastSettingsFetch = 0;
const SETTINGS_CACHE_TTL = 300_000; // 5 minutes fast memory cache

export const DEFAULT_HERMES_PARAMETERS: HermesParameters = {
  minConfidenceNormal: 50,
  minConfidenceStrong: 65,
  minConfidenceReversal: 60,
  minConfidenceRange: 55,
  spikeAtrMultiplier: 2.5,
  rsiOversoldThreshold: 30,
  rsiOverboughtThreshold: 70,
  minAtrFilter: 1.2,
  asianSessionMinConfidence: 55,
};

export async function getSystemSettings(forceRefresh = false): Promise<SystemSettings> {
  const now = Date.now();
  if (!forceRefresh && cachedSettings && (now - lastSettingsFetch < SETTINGS_CACHE_TTL)) {
    return cachedSettings;
  }

  // Check persisted disk settings as our authoritative baseline
  const diskSettings = loadLocalSettings();
  const baselineSettings = cachedSettings ? { ...diskSettings, ...cachedSettings } : diskSettings;

  try {
    const q = query(collection(db, 'settings'), limit(1));
    const snap = await withTimeout(getDocs(q), 1000).catch(() => null);
    if (!snap || snap.empty) {
      const defaultSettings: SystemSettings = {
        tradingMode: 'REAL',
        disableCooldowns: false,
        demoAccountId: '',
        realAccountId: process.env.META_ACCOUNT_ID || '',
        autoTradingDemoEnabled: true,
        autoTradingRealEnabled: true,
        autoTradingEnabled: true,
        metaApiSymbol: process.env.META_API_SYMBOL || 'XAUUSD',
        dashboardPasscode: 'goldswing2024',
        hermesEnabled: true,
        hermesReflectionCadence: 5,
        hermesMaxDrawdownLimit: 5.0,
        hermesStrategyVersion: 'v1.0.0',
        hermesParameters: { ...DEFAULT_HERMES_PARAMETERS },
        engineMode: 'HYBRID_DUAL',
        orbRiskPerTrade: 2.0,
        orbTargetMultiple: 5.0,
        orbStopAtrMultiplier: 1.5,
        orbAllowLondonSession: false,
        orbNewsFilterEnabled: true,
        featureStructuralStop: true,
        featureEntryConfirmation: true,
        featureContextPatternFilter: true,
        featureSpreadGuard: true,
        featureSessionFilter: true,
        tradingState: 'ACTIVE',
        ...(baselineSettings || {}), // PRESERVES engineMode and all customized settings!
      };
      cachedSettings = defaultSettings;
      lastSettingsFetch = now;
      saveLocalSettings(defaultSettings);
      return defaultSettings;
    }
    const d = snap.docs[0];
    const raw = d.data();
    const settings = {
      id: d.id,
      dashboardPasscode: 'goldswing2024',
      hermesEnabled: raw.hermesEnabled ?? true,
      hermesReflectionCadence: raw.hermesReflectionCadence ?? 5,
      hermesMaxDrawdownLimit: raw.hermesMaxDrawdownLimit ?? 5.0,
      hermesStrategyVersion: raw.hermesStrategyVersion ?? 'v1.0.0',
      hermesParameters: {
        ...DEFAULT_HERMES_PARAMETERS,
        ...(raw.hermesParameters || {})
      },
      engineMode: raw.engineMode ?? baselineSettings?.engineMode ?? 'HYBRID_DUAL',
      orbRiskPerTrade: raw.orbRiskPerTrade ?? 2.0,
      orbTargetMultiple: raw.orbTargetMultiple ?? 5.0,
      orbStopAtrMultiplier: raw.orbStopAtrMultiplier ?? 1.5,
      orbAllowLondonSession: raw.orbAllowLondonSession ?? false,
      orbNewsFilterEnabled: raw.orbNewsFilterEnabled ?? true,
      featureStructuralStop: raw.featureStructuralStop ?? true,
      featureEntryConfirmation: raw.featureEntryConfirmation ?? true,
      featureContextPatternFilter: raw.featureContextPatternFilter ?? true,
      featureSpreadGuard: raw.featureSpreadGuard ?? true,
      featureSessionFilter: raw.featureSessionFilter ?? true,
      tradingState: raw.tradingState ?? 'ACTIVE',
      ...baselineSettings,
      ...raw,
    } as SystemSettings;
    cachedSettings = settings;
    lastSettingsFetch = now;
    saveLocalSettings(settings);
    return settings;
  } catch {
    const fallbackSettings: SystemSettings = {
      tradingMode: 'REAL',
      disableCooldowns: false,
      demoAccountId: '',
      realAccountId: process.env.META_ACCOUNT_ID || '',
      autoTradingDemoEnabled: true,
      autoTradingRealEnabled: true,
      autoTradingEnabled: true,
      metaApiSymbol: process.env.META_API_SYMBOL || 'XAUUSD',
      dashboardPasscode: 'goldswing2024',
      hermesEnabled: true,
      hermesReflectionCadence: 5,
      hermesMaxDrawdownLimit: 5.0,
      hermesStrategyVersion: 'v1.0.0',
      hermesParameters: { ...DEFAULT_HERMES_PARAMETERS },
      engineMode: 'HYBRID_DUAL',
      orbRiskPerTrade: 2.0,
      orbTargetMultiple: 5.0,
      orbStopAtrMultiplier: 1.5,
      orbAllowLondonSession: false,
      orbNewsFilterEnabled: true,
      featureStructuralStop: true,
      featureEntryConfirmation: true,
      featureContextPatternFilter: true,
      featureSpreadGuard: true,
      featureSessionFilter: true,
      tradingState: 'ACTIVE',
      ...(baselineSettings || {}), // PRESERVES user's engineMode!
    };
    cachedSettings = fallbackSettings;
    lastSettingsFetch = now;
    saveLocalSettings(fallbackSettings);
    return fallbackSettings;
  }
}

export async function updateSystemSettings(settings: Partial<SystemSettings>): Promise<SystemSettings> {
  const current = await getSystemSettings();
  const id = current.id || 'general';
  
  const updated = { ...current, ...settings };
  delete updated.id; // don't write id into document
  
  cachedSettings = { ...updated, id };
  lastSettingsFetch = Date.now();

  saveLocalSettings(cachedSettings);

  withTimeout(setDoc(doc(db, 'settings', id), updated, { merge: true }), 1500).catch(() => null);
  return cachedSettings;
}

export async function getSignalById(id: string): Promise<Signal | null> {
  const item = localSignalsCache.find(s => s.id === id);
  if (item) return item;
  try {
    const snap = await withTimeout(getDoc(doc(db, 'signals', id)), 1000).catch(() => null);
    if (!snap || !snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as Signal;
  } catch {
    return null;
  }
}

export async function insertHermesHypothesis(data: Omit<HermesHypothesis, 'id'>): Promise<string> {
  const docRef = await addDoc(collection(db, 'hermes_hypotheses'), {
    ...data,
    createdAt: new Date(),
  });
  return docRef.id;
}

export async function getHermesHypotheses(limitCount = 20): Promise<HermesHypothesis[]> {
  try {
    const q = query(collection(db, 'hermes_hypotheses'), orderBy('createdAt', 'desc'), limit(limitCount));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
    } as HermesHypothesis));
  } catch (err) {
    // If composite index is pending, fallback to un-ordered query
    const q = query(collection(db, 'hermes_hypotheses'), limit(limitCount));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
    } as HermesHypothesis)).sort((a, b) => (b.cycle || 0) - (a.cycle || 0));
  }
}

export async function getLatestHermesHypothesis(): Promise<HermesHypothesis | null> {
  const list = await getHermesHypotheses(1);
  return list.length > 0 ? list[0] : null;
}
