import { logger } from "./logger.js";
import { getLatestPrice } from "./priceEvents.js";
import { getMetaApiStatus, getMetaApiLatency } from "./metaApiFeed.js";
import { getSystemSettings } from "@workspace/db";

export type HermesLogLevel = "INFO" | "SUCCESS" | "WARN" | "ERROR";
export type HermesLogType =
  | "HEARTBEAT"
  | "STATE_UPDATE"
  | "COMM_PROBE"
  | "CONVICTION_GATE"
  | "GAP_WARNING"
  | "SYSTEM_EVENT";
export type HermesComponent =
  | "HERMES_CORE"
  | "METAAPI_FEED"
  | "FIRESTORE_SYNC"
  | "BROKER_GATEWAY"
  | "SCHEDULER"
  | "ORB_SUPERVISOR";

export interface HermesLogEntry {
  id: string;
  timestamp: string;
  timeMs: number;
  type: HermesLogType;
  level: HermesLogLevel;
  component: HermesComponent;
  message: string;
  latencyMs?: number;
  gapDurationSec?: number;
  details?: Record<string, any>;
}

export interface HermesLogMetrics {
  heartbeatIntervalSeconds: number;
  lastHeartbeatTime: string | null;
  timeSinceLastHeartbeatMs: number;
  totalHeartbeatsRecorded: number;
  gapsDetectedCount: number;
  lastGapDetectedAt: string | null;
  lastGapDurationSec: number | null;
  avgProbeLatencyMs: number;
  healthState: "SYNCHRONIZED" | "CAUTION_LATENCY" | "GAP_DETECTED" | "DISCONNECTED";
  activeBrainState: {
    enabled: boolean;
    strategyVersion: string;
    engineMode: string;
    livePrice: number | null;
    metaApiConnected: boolean;
    memoryHeapMb: number;
  };
}

const MAX_LOGS = 250;
const logBuffer: HermesLogEntry[] = [];
let totalHeartbeats = 0;
let lastHeartbeatMs = 0;
let gapsCount = 0;
let lastGapAt: string | null = null;
let lastGapDurationSec: number | null = null;
const probeLatencies: number[] = [];

// Thresholds for detecting communication gaps
const HEARTBEAT_INTERVAL_MS = 5_000; // 5-second pulse
const HEARTBEAT_GAP_THRESHOLD_MS = 14_000; // >14s silence flags a communication gap
const PRICE_FEED_GAP_THRESHOLD_MS = 30_000; // >30s silence from broker quote feed

/**
 * Add an entry to the circular log buffer
 */
export function recordHermesLog(entry: Omit<HermesLogEntry, "id" | "timeMs">): HermesLogEntry {
  const timeMs = Date.now();
  const id = `hl_${timeMs}_${Math.random().toString(36).slice(2, 7)}`;
  const fullEntry: HermesLogEntry = {
    ...entry,
    id,
    timeMs,
  };

  logBuffer.unshift(fullEntry);
  if (logBuffer.length > MAX_LOGS) {
    logBuffer.pop();
  }

  return fullEntry;
}

/**
 * Record a state transition in Hermes AI Brain (e.g. strategy version bump, mode switch, parameter retune)
 */
export function recordHermesStateUpdate(
  title: string,
  details: {
    previousState?: any;
    newState?: any;
    reason?: string;
    engineMode?: string;
    strategyVersion?: string;
    component?: HermesComponent;
  }
): HermesLogEntry {
  const component = details.component || "HERMES_CORE";
  return recordHermesLog({
    timestamp: new Date().toISOString(),
    type: "STATE_UPDATE",
    level: "INFO",
    component,
    message: title,
    details,
  });
}

/**
 * Record a communication gap warning
 */
export function recordHermesGapWarning(
  component: HermesComponent,
  message: string,
  gapDurationSec: number,
  details?: Record<string, any>
): HermesLogEntry {
  gapsCount++;
  lastGapAt = new Date().toISOString();
  lastGapDurationSec = Number(gapDurationSec.toFixed(1));

  logger.warn({ component, gapDurationSec, ...details }, `[Hermes Heartbeat] Communication gap: ${message}`);

  return recordHermesLog({
    timestamp: lastGapAt,
    type: "GAP_WARNING",
    level: "WARN",
    component,
    message: `[COMMUNICATION GAP: ${gapDurationSec.toFixed(1)}s] ${message}`,
    gapDurationSec: lastGapDurationSec,
    details: {
      ...details,
      recoveredAt: new Date().toISOString(),
    },
  });
}

/**
 * Record a conviction gating evaluation from the Hermes Risk Guardian
 */
export function recordHermesConvictionGate(
  passed: boolean,
  signal: string,
  confidence: number,
  requiredConfidence: number,
  reason: string,
  details?: Record<string, any>
): HermesLogEntry {
  return recordHermesLog({
    timestamp: new Date().toISOString(),
    type: "CONVICTION_GATE",
    level: passed ? "SUCCESS" : "WARN",
    component: "HERMES_CORE",
    message: passed
      ? `Hermes Conviction Approved: ${signal} at ${confidence}% (Threshold: ${requiredConfidence}%)`
      : `Hermes Conviction Filtered: ${signal} rejected at ${confidence}% (Requires ${requiredConfidence}%)`,
    details: {
      passed,
      signal,
      confidence,
      requiredConfidence,
      delta: confidence - requiredConfidence,
      reason,
      ...details,
    },
  });
}

/**
 * Execute a live round-trip communication probe across Hermes, MetaApi, and Database
 */
export async function runHermesCommProbe(): Promise<{
  success: boolean;
  totalLatencyMs: number;
  metaApiLatencyMs: number;
  dbLatencyMs: number;
  livePrice: number | null;
  entry: HermesLogEntry;
}> {
  const start = Date.now();
  let dbLatency = 0;
  let metaApiLatency = 0;
  let price: number | null = null;

  try {
    // 1. Measure DB round-trip
    const dbStart = Date.now();
    await getSystemSettings();
    dbLatency = Date.now() - dbStart;

    // 2. Measure MetaApi & Price state
    metaApiLatency = getMetaApiLatency();
    const live = getLatestPrice();
    price = live?.price ?? null;

    const totalLatency = Date.now() - start;
    probeLatencies.push(totalLatency);
    if (probeLatencies.length > 20) probeLatencies.shift();

    const entry = recordHermesLog({
      timestamp: new Date().toISOString(),
      type: "COMM_PROBE",
      level: totalLatency > 800 ? "WARN" : "SUCCESS",
      component: "HERMES_CORE",
      message: `Diagnostic Communication Probe completed in ${totalLatency}ms (DB: ${dbLatency}ms, MetaApi: ${metaApiLatency}ms, Tick: ${price ? `$${price.toFixed(2)}` : "STANDBY"})`,
      latencyMs: totalLatency,
      details: {
        totalLatencyMs: totalLatency,
        dbLatencyMs: dbLatency,
        metaApiLatencyMs: metaApiLatency,
        livePrice: price,
        heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
    });

    return {
      success: true,
      totalLatencyMs: totalLatency,
      metaApiLatencyMs: metaApiLatency,
      dbLatencyMs: dbLatency,
      livePrice: price,
      entry,
    };
  } catch (err: any) {
    const totalLatency = Date.now() - start;
    const entry = recordHermesLog({
      timestamp: new Date().toISOString(),
      type: "COMM_PROBE",
      level: "ERROR",
      component: "HERMES_CORE",
      message: `Communication Probe failed after ${totalLatency}ms: ${err?.message || err}`,
      latencyMs: totalLatency,
      details: { error: err?.message || String(err) },
    });

    return {
      success: false,
      totalLatencyMs: totalLatency,
      metaApiLatencyMs: metaApiLatency,
      dbLatencyMs: dbLatency,
      livePrice: price,
      entry,
    };
  }
}

/**
 * Perform a single heartbeat pulse check
 */
export async function recordHeartbeatPulse(): Promise<void> {
  const now = Date.now();
  const timeSinceLast = lastHeartbeatMs > 0 ? now - lastHeartbeatMs : 0;
  lastHeartbeatMs = now;
  totalHeartbeats++;

  // 1. Check if the gap since previous heartbeat was abnormally large
  if (timeSinceLast > HEARTBEAT_GAP_THRESHOLD_MS && totalHeartbeats > 1) {
    const gapSec = timeSinceLast / 1000;
    recordHermesGapWarning(
      "HERMES_CORE",
      `Event loop or system silence gap detected between heartbeats (${gapSec.toFixed(1)}s elapsed vs ~5s target)`,
      gapSec,
      { expectedIntervalMs: HEARTBEAT_INTERVAL_MS, actualElapsedMs: timeSinceLast }
    );
  }

  // 2. Check price feed tick staleness
  const livePrice = getLatestPrice();
  if (livePrice && livePrice.ms) {
    const tickSilenceMs = now - livePrice.ms;
    if (tickSilenceMs > PRICE_FEED_GAP_THRESHOLD_MS) {
      const gapSec = tickSilenceMs / 1000;
      // Log feed gap if not already recently reported
      if (!lastGapAt || now - new Date(lastGapAt).getTime() > 60_000) {
        recordHermesGapWarning(
          "METAAPI_FEED",
          `Price tick feed silent for ${gapSec.toFixed(1)}s. Broker connection may be experiencing idle gap or weekend hold.`,
          gapSec,
          { lastTickPrice: livePrice.price, tickTime: livePrice.timestamp }
        );
      }
    }
  }

  // 3. Record standard heartbeat pulse entry
  const metaStatus = getMetaApiStatus();
  const metaLatency = getMetaApiLatency();
  const mem = process.memoryUsage();
  const heapMb = Math.round(mem.heapUsed / 1024 / 1024);

  recordHermesLog({
    timestamp: new Date().toISOString(),
    type: "HEARTBEAT",
    level: "INFO",
    component: "HERMES_CORE",
    message: `Heartbeat Pulse #${totalHeartbeats} · Synced [MetaApi: ${metaStatus?.connected ? "CONNECTED" : "STANDBY"}, Latency: ${metaLatency}ms, Heap: ${heapMb}MB, Price: ${livePrice?.price ? `$${livePrice.price.toFixed(2)}` : "STANDBY"}]`,
    latencyMs: metaLatency,
    details: {
      pulseNumber: totalHeartbeats,
      timeSincePreviousMs: timeSinceLast,
      metaApiConnected: Boolean(metaStatus?.connected),
      metaLatencyMs: metaLatency,
      heapUsedMb: heapMb,
      livePrice: livePrice?.price ?? null,
      spread: livePrice?.spread ?? null,
    },
  });
}

/**
 * Retrieve logs and real-time communication metrics
 */
export async function getHermesLogFeed(
  limit = 100,
  filterType?: HermesLogType,
  filterLevel?: HermesLogLevel
): Promise<{
  logs: HermesLogEntry[];
  metrics: HermesLogMetrics;
}> {
  let filtered = logBuffer;
  if (filterType) {
    filtered = filtered.filter((l) => l.type === filterType);
  }
  if (filterLevel) {
    filtered = filtered.filter((l) => l.level === filterLevel);
  }

  const settings = await getSystemSettings().catch(() => null);
  const live = getLatestPrice();
  const metaStatus = getMetaApiStatus();
  const now = Date.now();
  const timeSinceLastHeartbeat = lastHeartbeatMs > 0 ? now - lastHeartbeatMs : 0;

  const avgProbe =
    probeLatencies.length > 0
      ? Math.round(probeLatencies.reduce((a, b) => a + b, 0) / probeLatencies.length)
      : 22;

  let healthState: HermesLogMetrics["healthState"] = "SYNCHRONIZED";
  if (!metaStatus?.connected) {
    healthState = "DISCONNECTED";
  } else if (timeSinceLastHeartbeat > HEARTBEAT_GAP_THRESHOLD_MS) {
    healthState = "GAP_DETECTED";
  } else if (getMetaApiLatency() > 1500) {
    healthState = "CAUTION_LATENCY";
  }

  const metrics: HermesLogMetrics = {
    heartbeatIntervalSeconds: HEARTBEAT_INTERVAL_MS / 1000,
    lastHeartbeatTime: lastHeartbeatMs > 0 ? new Date(lastHeartbeatMs).toISOString() : null,
    timeSinceLastHeartbeatMs: timeSinceLastHeartbeat,
    totalHeartbeatsRecorded: totalHeartbeats,
    gapsDetectedCount: gapsCount,
    lastGapDetectedAt: lastGapAt,
    lastGapDurationSec: lastGapDurationSec,
    avgProbeLatencyMs: avgProbe,
    healthState,
    activeBrainState: {
      enabled: settings?.hermesEnabled ?? true,
      strategyVersion: settings?.hermesStrategyVersion || "v1.0.2",
      engineMode: settings?.engineMode || "HYBRID_DUAL",
      livePrice: live?.price ?? null,
      metaApiConnected: Boolean(metaStatus?.connected),
      memoryHeapMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    },
  };

  return {
    logs: filtered.slice(0, limit),
    metrics,
  };
}

/**
 * Clear diagnostic logs
 */
export function clearHermesLogBuffer(): void {
  logBuffer.length = 0;
  gapsCount = 0;
  lastGapAt = null;
  lastGapDurationSec = null;
  recordHermesLog({
    timestamp: new Date().toISOString(),
    type: "SYSTEM_EVENT",
    level: "INFO",
    component: "HERMES_CORE",
    message: "Hermes diagnostic log buffer cleared by administrator.",
  });
}

// ── Background Heartbeat Timer ─────────────────────────────────────────────
let heartbeatTimerStarted = false;
export function startHermesHeartbeatDaemon(): void {
  if (heartbeatTimerStarted) return;
  heartbeatTimerStarted = true;

  // Initial heartbeat
  recordHeartbeatPulse().catch((err) => {
    logger.warn({ err }, "[Hermes Heartbeat] Initial pulse failed");
  });

  setInterval(() => {
    recordHeartbeatPulse().catch((err) => {
      logger.warn({ err }, "[Hermes Heartbeat] Pulse execution failed");
    });
  }, HEARTBEAT_INTERVAL_MS);

  logger.info(
    { intervalMs: HEARTBEAT_INTERVAL_MS },
    "🚀 [Hermes Heartbeat Daemon] Background pulse and gap monitoring initialized."
  );
}
