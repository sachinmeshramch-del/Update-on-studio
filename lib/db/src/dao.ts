import { db } from './index';
import { Signal, InsertSignal, PushSubscription, HermesHypothesis, HermesParameters } from './schema/index';
import { collection, query, where, getDocs, getDoc, addDoc, updateDoc, doc, deleteDoc, orderBy, limit, writeBatch } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

function getAllSignalsCacheFilePaths(): string[] {
  return Array.from(new Set([
    path.resolve(process.cwd(), '.signals_cache.json'),
    path.resolve(process.cwd(), 'artifacts/api-server', '.signals_cache.json'),
    path.resolve('/app/applet/artifacts/api-server', '.signals_cache.json'),
    path.resolve('/app/applet', '.signals_cache.json'),
  ]));
}

function getSignalsCacheFilePath(): string {
  const possiblePaths = getAllSignalsCacheFilePaths();
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return path.resolve(process.cwd(), '.signals_cache.json');
}

async function withTimeout<T>(promise: Promise<T>, ms = 1500): Promise<T> {
  let timer: any;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Firestore operation timed out')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

interface HistoryMetaState {
  clearedHistoryAt: string | null;
  deletedBrokerPositionIds: string[];
  isHistoryClearedPermanently: boolean;
}

function getHistoryMetaFilePath(): string {
  const candidateDirs = [
    process.cwd(),
    path.resolve(process.cwd(), 'artifacts/api-server'),
    path.resolve(process.cwd(), '..'),
    path.resolve(process.cwd(), '../..')
  ];
  for (const d of candidateDirs) {
    const p = path.resolve(d, '.history_meta.json');
    if (fs.existsSync(p)) return p;
  }
  return path.resolve(process.cwd(), '.history_meta.json');
}

let historyMetaState: HistoryMetaState = {
  clearedHistoryAt: null,
  deletedBrokerPositionIds: [],
  isHistoryClearedPermanently: false
};

function loadHistoryMeta(): void {
  try {
    const p = getHistoryMetaFilePath();
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf8');
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        historyMetaState = {
          clearedHistoryAt: data.clearedHistoryAt || null,
          deletedBrokerPositionIds: Array.isArray(data.deletedBrokerPositionIds) ? data.deletedBrokerPositionIds : [],
          isHistoryClearedPermanently: !!data.isHistoryClearedPermanently
        };
      }
    }
  } catch {}
}

function saveHistoryMeta(): void {
  try {
    const p = getHistoryMetaFilePath();
    fs.writeFileSync(p, JSON.stringify(historyMetaState, null, 2), 'utf8');
  } catch (e) {
    console.warn("[DB] Failed saving history metadata:", e);
  }
}

loadHistoryMeta();

export function getClearedHistoryTime(): number {
  if (!historyMetaState.clearedHistoryAt) return 0;
  return new Date(historyMetaState.clearedHistoryAt).getTime();
}

export function getDeletedBrokerPositionIds(): Set<string> {
  return new Set(historyMetaState.deletedBrokerPositionIds.map(String));
}

export function isHistoryClearedPermanently(): boolean {
  return historyMetaState.isHistoryClearedPermanently;
}

export function resetClearedHistoryMeta(): void {
  historyMetaState.clearedHistoryAt = null;
  historyMetaState.deletedBrokerPositionIds = [];
  historyMetaState.isHistoryClearedPermanently = false;
  saveHistoryMeta();
}

let localSignalsCache: Signal[] = [];
let isFirestoreSignalsLoaded = false;
let isFirestoreLoadingInFlight = false;

function loadLocalSignals(): void {
  try {
    const candidateFiles = getAllSignalsCacheFilePaths();
    const allParsedSignals: any[] = [];
    for (const file of candidateFiles) {
      if (fs.existsSync(file)) {
        try {
          const raw = fs.readFileSync(file, 'utf8');
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            allParsedSignals.push(...parsed);
          }
        } catch {}
      }
    }
    if (allParsedSignals.length === 0) {
      return;
    }

    const seenIds = new Set<string>();
    const seenBrokerIds = new Set<string>();
    const deduped: Signal[] = [];

    for (const item of allParsedSignals) {
      if (!item || typeof item !== 'object') continue;
      const id = String(item.id || '');
      const brokerId = item.brokerPositionId ? String(item.brokerPositionId) : null;

      if (id && seenIds.has(id)) continue;
      if (brokerId && seenBrokerIds.has(brokerId)) continue;

      // Prevent duplicate trades created at the same minute with identical direction and price
      const sTime = item.createdAt ? new Date(item.createdAt).getTime() : 0;
      const isDuplicateTimeAndPrice = deduped.some(existing => {
        const exTime = existing.createdAt ? new Date(existing.createdAt).getTime() : 0;
        if (Math.abs(sTime - exTime) < 60_000 && existing.signal === item.signal) {
          const priceDiff = Math.abs((existing.entryPrice || 0) - (item.entryPrice || 0));
          return priceDiff <= 1.5;
        }
        return false;
      });
      if (isDuplicateTimeAndPrice) continue;

      if (id) seenIds.add(id);
      if (brokerId) seenBrokerIds.add(brokerId);

      deduped.push({
        ...item,
        createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
        closedAt: item.closedAt ? new Date(item.closedAt) : null,
      } as Signal);
    }

    deduped.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    localSignalsCache = deduped;
  } catch (e) {
    console.warn("[DB] Failed reading local signals cache:", e);
  }
}

function saveLocalSignals(): void {
  try {
    const candidateFiles = getAllSignalsCacheFilePaths();
    const payload = JSON.stringify(localSignalsCache, null, 2);
    for (const file of candidateFiles) {
      try {
        const dir = path.dirname(file);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, payload, 'utf8');
      } catch {}
    }
  } catch (e) {
    console.warn("[DB] Failed writing local signals cache:", e);
  }
}

export async function loadFirestoreSignals(): Promise<void> {
  if (isFirestoreSignalsLoaded || isFirestoreLoadingInFlight) return;
  isFirestoreLoadingInFlight = true;
  try {
    const q = query(collection(db, 'signals'), orderBy('createdAt', 'desc'), limit(500));
    const snap = await withTimeout(getDocs(q), 3000).catch(() => null);
    if (snap && !snap.empty) {
      const fsSignals: Signal[] = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : new Date()),
          closedAt: data.closedAt?.toDate ? data.closedAt.toDate() : (data.closedAt ? new Date(data.closedAt) : null),
        } as Signal;
      });

      const seenIds = new Set<string>(localSignalsCache.map(s => String(s.id)));
      const seenBrokerIds = new Set<string>(
        localSignalsCache.map(s => s.brokerPositionId).filter(Boolean).map(String)
      );

      let addedCount = 0;
      for (const sig of fsSignals) {
        const id = String(sig.id);
        const brokerId = sig.brokerPositionId ? String(sig.brokerPositionId) : null;
        if (seenIds.has(id)) continue;
        if (brokerId && seenBrokerIds.has(brokerId)) continue;

        seenIds.add(id);
        if (brokerId) seenBrokerIds.add(brokerId);

        localSignalsCache.push(sig);
        addedCount++;
      }

      if (addedCount > 0) {
        localSignalsCache.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        saveLocalSignals();
        console.log(`[DB] Restored ${addedCount} historical signals from Firestore upon server startup/refresh.`);
      }
    }
    isFirestoreSignalsLoaded = true;
  } catch (e) {
    console.warn("[DB] Note: Could not query Firestore signals on startup:", e);
  } finally {
    isFirestoreLoadingInFlight = false;
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
  const item = localSignalsCache.find(s => s.id === id || (s.brokerPositionId && String(s.brokerPositionId) === String(id)));
  if (item) {
    item.tradeStatus = tradeStatus;
    item.closedPrice = closedPrice;
    item.pnlPoints = pnlPoints;
    item.closedAt = new Date();
    saveLocalSignals();
  }
  const targetDocId = item?.id || id;
  withTimeout(updateDoc(doc(db, 'signals', targetDocId), {
    tradeStatus, closedPrice, pnlPoints, closedAt: new Date()
  }), 1500).catch(() => null);
}

export async function getClosedTrades(limitCount: number): Promise<Signal[]> {
  return localSignalsCache.filter(s => s.tradeStatus !== 'RUNNING').slice(0, limitCount);
}

export async function insertSignal(signalData: InsertSignal & { createdAt?: Date }): Promise<void> {
  // STRICT BACKTEST ISOLATION: Backtesting engine results MUST NOT be saved into the live signal history table!
  if ((signalData as any).isBacktestResult || (signalData as any).executionType === "BACKTEST" || (signalData as any).isBacktest === true) {
    return;
  }

  const createdAt = (signalData as any).createdAt ? new Date((signalData as any).createdAt) : new Date();
  const closedAt = (signalData as any).closedAt ? new Date((signalData as any).closedAt) : ((signalData as any).closedAt ?? null);

  // 1. Match by ID, Broker Position ID, or same direction & entry price within 60s
  const targetId = (signalData as any).id;
  const existingIdx = localSignalsCache.findIndex(s => {
    if (targetId && s.id === targetId) return true;
    if (signalData.brokerPositionId && s.brokerPositionId && String(s.brokerPositionId) === String(signalData.brokerPositionId)) return true;
    
    // Prevent duplicate trades triggered at the same time (within 60s) with same direction and entry price
    const sTime = s.createdAt ? new Date(s.createdAt).getTime() : 0;
    const timeDiff = Math.abs(createdAt.getTime() - sTime);
    if (timeDiff < 60_000 && s.signal === signalData.signal) {
      const priceDiff = Math.abs((s.entryPrice || 0) - (signalData.entryPrice || 0));
      if (priceDiff <= 1.5) {
        return true;
      }
    }
    return false;
  });

  if (existingIdx !== -1) {
    const existing = localSignalsCache[existingIdx];
    localSignalsCache[existingIdx] = {
      ...existing,
      ...signalData,
      id: existing.id,
      createdAt: existing.createdAt || createdAt,
      closedAt: closedAt || existing.closedAt,
      // Retain richer analytical reason if current is generic
      reason: (existing.reason && !existing.reason.startsWith("AutoTrader Execution") && !existing.reason.startsWith("Session Triggered"))
        ? existing.reason
        : (signalData.reason || existing.reason),
      brokerPositionId: signalData.brokerPositionId || existing.brokerPositionId,
      isRealTrade: Boolean(signalData.isRealTrade ?? existing.isRealTrade),
      executionStatus: signalData.executionStatus || existing.executionStatus,
      executionReason: signalData.executionReason || existing.executionReason,
      executionType: signalData.executionType || existing.executionType,
    } as Signal;
    saveLocalSignals();
    return;
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
  return 0; // Seeding disabled permanently to prevent historical sample trades in live history
}

// Immediately load cache upon startup
loadLocalSignals();

export async function getRecentSignals(limitCount: number): Promise<Signal[]> {
  if (!isFirestoreSignalsLoaded && localSignalsCache.length === 0) {
    await loadFirestoreSignals().catch(() => {});
  } else if (!isFirestoreSignalsLoaded) {
    loadFirestoreSignals().catch(() => {});
  }

  // Return all live bot signals and MT5 executed trades, excluding only backtest runner results
  const liveSignalsOnly = localSignalsCache.filter(s =>
    s.executionType !== "BACKTEST" &&
    (s as any).isBacktestResult !== true &&
    (s as any).isBacktest !== true &&
    !String(s.id || "").startsWith("seed-") &&
    !String(s.reason || "").toLowerCase().includes("backtest run") &&
    !String(s.executionReason || "").toLowerCase().includes("backtest run")
  );
  return liveSignalsOnly.slice(0, limitCount);
}

export async function deleteSignalById(id: string): Promise<boolean> {
  const target = localSignalsCache.find(s => s.id === id);
  if (target?.brokerPositionId) {
    const pid = String(target.brokerPositionId);
    if (!historyMetaState.deletedBrokerPositionIds.includes(pid)) {
      historyMetaState.deletedBrokerPositionIds.push(pid);
      saveHistoryMeta();
    }
  }

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

  // Collect all brokerPositionIds so broker sync never resurrects them
  const posIdsToBlacklist = localSignalsCache
    .map(s => s.brokerPositionId)
    .filter(Boolean)
    .map(String);

  const merged = new Set([...historyMetaState.deletedBrokerPositionIds, ...posIdsToBlacklist]);
  historyMetaState.deletedBrokerPositionIds = Array.from(merged);
  historyMetaState.clearedHistoryAt = new Date().toISOString();
  historyMetaState.isHistoryClearedPermanently = true;
  saveHistoryMeta();

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
  const item = localSignalsCache.find(s => s.id === id || (s.brokerPositionId && String(s.brokerPositionId) === String(id)));
  if (item) {
    item.stopLoss = stopLoss;
    saveLocalSignals();
  }
  const targetDocId = item?.id || id;
  withTimeout(updateDoc(doc(db, 'signals', targetDocId), { stopLoss }), 1500).catch(() => null);
}

export async function updateTradeStopLossAndTakeProfit(id: string, stopLoss: number, takeProfit: number): Promise<void> {
  const item = localSignalsCache.find(s => s.id === id || (s.brokerPositionId && String(s.brokerPositionId) === String(id)));
  if (item) {
    item.stopLoss = stopLoss;
    item.takeProfit = takeProfit;
    saveLocalSignals();
  }
  const targetDocId = item?.id || id;
  withTimeout(updateDoc(doc(db, 'signals', targetDocId), { stopLoss, takeProfit }), 1500).catch(() => null);
}

export async function updateTradeEntryPrice(id: string, entryPrice: number): Promise<void> {
  const item = localSignalsCache.find(s => s.id === id || (s.brokerPositionId && String(s.brokerPositionId) === String(id)));
  if (item) {
    item.entryPrice = entryPrice;
    saveLocalSignals();
  }
  const targetDocId = item?.id || id;
  withTimeout(updateDoc(doc(db, 'signals', targetDocId), { entryPrice }), 1500).catch(() => null);
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
    const payload = JSON.stringify(settings, null, 2);
    const candidatePaths = [
      path.resolve(process.cwd(), SETTINGS_FILE_NAME),
      path.resolve(process.cwd(), 'artifacts/api-server', SETTINGS_FILE_NAME),
      path.resolve('/app/applet/artifacts/api-server', SETTINGS_FILE_NAME),
      path.resolve('/app/applet', SETTINGS_FILE_NAME),
    ];
    for (const file of candidatePaths) {
      try {
        const dir = path.dirname(file);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, payload, 'utf8');
      } catch {}
    }
  } catch (e) {
    console.warn('[DB] Failed writing local settings cache:', e);
  }
}

let cachedSettings: SystemSettings | null = null;
let lastSettingsFetch = 0;
const SETTINGS_CACHE_TTL = 1_000; // 1 second fast memory cache for immediate responsiveness

export const DEFAULT_HERMES_PARAMETERS: HermesParameters = {
  minConfidenceNormal: 72,
  minConfidenceStrong: 82,
  minConfidenceReversal: 78,
  minConfidenceRange: 75,
  spikeAtrMultiplier: 2.5,
  rsiOversoldThreshold: 30,
  rsiOverboughtThreshold: 70,
  minAtrFilter: 1.5,
  asianSessionMinConfidence: 78,
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
        autoTradingDemoEnabled: diskSettings?.autoTradingDemoEnabled ?? false,
        autoTradingRealEnabled: diskSettings?.autoTradingRealEnabled ?? false,
        autoTradingEnabled: diskSettings?.autoTradingEnabled ?? false,
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
        ...(baselineSettings || {}),
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
        ...(raw.hermesParameters || {}),
        minConfidenceNormal: Math.max(72, raw.hermesParameters?.minConfidenceNormal ?? 72),
        minConfidenceStrong: Math.max(82, raw.hermesParameters?.minConfidenceStrong ?? 82),
        minConfidenceReversal: Math.max(78, raw.hermesParameters?.minConfidenceReversal ?? 78),
        minConfidenceRange: Math.max(75, raw.hermesParameters?.minConfidenceRange ?? 75),
        asianSessionMinConfidence: Math.max(78, raw.hermesParameters?.asianSessionMinConfidence ?? 78),
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
      ...raw, // Raw user preferences in DB MUST override baseline disk defaults
    } as SystemSettings;

    // Enforce high-conviction anti-overtrading confidence thresholds (72%+)
    if (settings.hermesParameters) {
      settings.hermesParameters = {
        ...DEFAULT_HERMES_PARAMETERS,
        ...settings.hermesParameters,
        minConfidenceNormal: Math.max(72, settings.hermesParameters.minConfidenceNormal || 72),
        minConfidenceStrong: Math.max(82, settings.hermesParameters.minConfidenceStrong || 82),
        minConfidenceReversal: Math.max(78, settings.hermesParameters.minConfidenceReversal || 78),
        minConfidenceRange: Math.max(75, settings.hermesParameters.minConfidenceRange || 75),
        asianSessionMinConfidence: Math.max(78, settings.hermesParameters.asianSessionMinConfidence || 78),
      };
    }

    // Enforce master switch consistency
    if (settings.autoTradingEnabled === false) {
      settings.autoTradingRealEnabled = false;
      settings.autoTradingDemoEnabled = false;
    } else if (settings.autoTradingRealEnabled === false && settings.autoTradingDemoEnabled === false) {
      settings.autoTradingEnabled = false;
    }

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
      autoTradingDemoEnabled: diskSettings?.autoTradingDemoEnabled ?? false,
      autoTradingRealEnabled: diskSettings?.autoTradingRealEnabled ?? false,
      autoTradingEnabled: diskSettings?.autoTradingEnabled ?? false,
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
      ...(baselineSettings || {}),
    };
    if (fallbackSettings.autoTradingEnabled === false) {
      fallbackSettings.autoTradingRealEnabled = false;
      fallbackSettings.autoTradingDemoEnabled = false;
    }
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

  // Explicitly keep master switch synchronized with mode switches
  if (settings.autoTradingEnabled === false) {
    updated.autoTradingEnabled = false;
    updated.autoTradingRealEnabled = false;
    updated.autoTradingDemoEnabled = false;
  } else if (settings.autoTradingRealEnabled === false && updated.autoTradingDemoEnabled === false) {
    updated.autoTradingEnabled = false;
  } else if (settings.autoTradingDemoEnabled === false && updated.autoTradingRealEnabled === false) {
    updated.autoTradingEnabled = false;
  } else if (settings.autoTradingRealEnabled === true || settings.autoTradingDemoEnabled === true || settings.autoTradingEnabled === true) {
    updated.autoTradingEnabled = true;
  }

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
