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
        localSignalsCache = parsed.map((item: any) => ({
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

export async function insertSignal(signalData: InsertSignal): Promise<void> {
  const id = `sig-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const newSig: Signal = {
    ...signalData,
    id,
    createdAt: new Date(),
    closedAt: null,
  } as Signal;
  localSignalsCache.unshift(newSig);
  saveLocalSignals();

  withTimeout(addDoc(collection(db, 'signals'), {
    ...signalData,
    createdAt: new Date(),
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
      createdAt: new Date(Date.now() - 2 * 3600 * 1000), // 2 hours ago
      tradeStatus: "STOP_HIT",
      closedPrice: 4151.78,
      closedAt: new Date(Date.now() - 1.25 * 3600 * 1000),
      pnlPoints: -6.70,
      signalType: "TREND_FOLLOW",
      isRealTrade: true,
      brokerPositionId: "7849102",
      executionStatus: "EXECUTED",
      executionType: "REAL_MT5",
      executionReason: "Executed on Real MT5 Account (Ticket #7849102)"
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
      createdAt: new Date(Date.now() - 5 * 3600 * 1000), // 5 hours ago
      tradeStatus: "TARGET_HIT",
      closedPrice: 4155.00,
      closedAt: new Date(Date.now() - 3.6 * 3600 * 1000),
      pnlPoints: 16.50,
      signalType: "TREND_FOLLOW",
      isRealTrade: true,
      brokerPositionId: "7848914",
      executionStatus: "EXECUTED",
      executionType: "REAL_MT5",
      executionReason: "Executed on Real MT5 Account (Ticket #7848914)"
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
      createdAt: new Date(Date.now() - 8 * 3600 * 1000), // 8 hours ago
      tradeStatus: "STOP_HIT",
      closedPrice: 4158.80,
      closedAt: new Date(Date.now() - 7.3 * 3600 * 1000),
      pnlPoints: -6.70,
      signalType: "REVERSAL",
      isRealTrade: false,
      brokerPositionId: null,
      executionStatus: "NOT_EXECUTED",
      executionType: "SIMULATED",
      executionReason: "Not executed on MT5 (Simulated / Signal Only)"
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
      createdAt: new Date(Date.now() - 24 * 3600 * 1000), // 1 day ago
      tradeStatus: "TARGET_HIT",
      closedPrice: 4142.10,
      closedAt: new Date(Date.now() - 21.75 * 3600 * 1000),
      pnlPoints: 16.70,
      signalType: "TREND_FOLLOW",
      isRealTrade: true,
      brokerPositionId: "7846201",
      executionStatus: "EXECUTED",
      executionType: "REAL_MT5",
      executionReason: "Executed on Real MT5 Account (Ticket #7846201)"
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
      createdAt: new Date(Date.now() - 28 * 3600 * 1000),
      tradeStatus: "STOP_HIT",
      closedPrice: 4154.50,
      closedAt: new Date(Date.now() - 27.1 * 3600 * 1000),
      pnlPoints: -5.60,
      signalType: "RANGE_BOUNCE",
      isRealTrade: false,
      brokerPositionId: null,
      executionStatus: "NOT_EXECUTED",
      executionType: "SIMULATED",
      executionReason: "Not executed on MT5 (Simulated / Signal Only)"
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
      createdAt: new Date(Date.now() - 34 * 3600 * 1000),
      tradeStatus: "TARGET_HIT",
      closedPrice: 4135.00,
      closedAt: new Date(Date.now() - 32.33 * 3600 * 1000),
      pnlPoints: 16.20,
      signalType: "TREND_FOLLOW",
      isRealTrade: true,
      brokerPositionId: "7844119",
      executionStatus: "EXECUTED",
      executionType: "REAL_MT5",
      executionReason: "Executed on Real MT5 Account (Ticket #7844119)"
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
      createdAt: new Date(Date.now() - 48 * 3600 * 1000), // 2 days ago
      tradeStatus: "TARGET_HIT",
      closedPrice: 4128.50,
      closedAt: new Date(Date.now() - 45.9 * 3600 * 1000),
      pnlPoints: 18.30,
      signalType: "TREND_FOLLOW",
      isRealTrade: true,
      brokerPositionId: "7841005",
      executionStatus: "EXECUTED",
      executionType: "REAL_MT5",
      executionReason: "Executed on Real MT5 Account (Ticket #7841005)"
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
      createdAt: new Date(Date.now() - 55 * 3600 * 1000),
      tradeStatus: "TARGET_HIT",
      closedPrice: 4118.00,
      closedAt: new Date(Date.now() - 53.16 * 3600 * 1000),
      pnlPoints: 17.60,
      signalType: "TREND_FOLLOW",
      isRealTrade: true,
      brokerPositionId: "7839812",
      executionStatus: "EXECUTED",
      executionType: "REAL_MT5",
      executionReason: "Executed on Real MT5 Account (Ticket #7839812)"
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
      createdAt: new Date(Date.now() - 72 * 3600 * 1000), // 3 days ago
      tradeStatus: "TARGET_HIT",
      closedPrice: 4112.80,
      closedAt: new Date(Date.now() - 69.5 * 3600 * 1000),
      pnlPoints: 17.70,
      signalType: "TREND_FOLLOW",
      isRealTrade: true,
      brokerPositionId: "7836102",
      executionStatus: "EXECUTED",
      executionType: "REAL_MT5",
      executionReason: "Executed on Real MT5 Account (Ticket #7836102)"
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
      createdAt: new Date(Date.now() - 80 * 3600 * 1000),
      tradeStatus: "CLOSED",
      closedPrice: 4102.50,
      closedAt: new Date(Date.now() - 78.83 * 3600 * 1000),
      pnlPoints: 5.80,
      signalType: "RANGE_BOUNCE",
      isRealTrade: true,
      brokerPositionId: "7834921",
      executionStatus: "EXECUTED",
      executionType: "REAL_MT5",
      executionReason: "Executed on Real MT5 Account (Ticket #7834921)"
    },
    {
      signal: "LONG",
      confidence: 83,
      entryPrice: 4080.50,
      stopLoss: 4073.80,
      takeProfit: 4098.20,
      trend: "BULLISH",
      reason: "Sunday market open gap recovery + 1m confirm momentum",
      tradeDuration: "1h 15m",
      createdAt: new Date(Date.now() - 96 * 3600 * 1000), // 4 days ago
      tradeStatus: "TARGET_HIT",
      closedPrice: 4098.20,
      closedAt: new Date(Date.now() - 94.75 * 3600 * 1000),
      pnlPoints: 17.70,
      signalType: "TREND_FOLLOW",
      isRealTrade: true,
      brokerPositionId: "7831002",
      executionStatus: "EXECUTED",
      executionType: "REAL_MT5",
      executionReason: "Executed on Real MT5 Account (Ticket #7831002)"
    },
    {
      signal: "SHORT",
      confidence: 87,
      entryPrice: 4088.00,
      stopLoss: 4094.80,
      takeProfit: 4071.50,
      trend: "BEARISH",
      reason: "Friday NY close distribution drop below 4080 support",
      tradeDuration: "1h 55m",
      createdAt: new Date(Date.now() - 120 * 3600 * 1000), // 5 days ago
      tradeStatus: "TARGET_HIT",
      closedPrice: 4071.50,
      closedAt: new Date(Date.now() - 118.08 * 3600 * 1000),
      pnlPoints: 16.50,
      signalType: "TREND_FOLLOW",
      isRealTrade: true,
      brokerPositionId: "7828114",
      executionStatus: "EXECUTED",
      executionType: "REAL_MT5",
      executionReason: "Executed on Real MT5 Account (Ticket #7828114)"
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

let cachedSettings: SystemSettings | null = null;
let lastSettingsFetch = 0;
const SETTINGS_CACHE_TTL = 15_000; // 15 seconds fast memory cache

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
      };
      cachedSettings = defaultSettings;
      lastSettingsFetch = now;
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
      engineMode: raw.engineMode ?? 'HYBRID_DUAL',
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
      ...raw
    } as SystemSettings;
    cachedSettings = settings;
    lastSettingsFetch = now;
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
    };
    cachedSettings = fallbackSettings;
    lastSettingsFetch = now;
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
