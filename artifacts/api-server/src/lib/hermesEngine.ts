import {
  getSystemSettings,
  updateSystemSettings,
  getClosedTrades,
  insertHermesHypothesis,
  getHermesHypotheses,
  getLatestHermesHypothesis,
  DEFAULT_HERMES_PARAMETERS,
  type HermesParameters,
  type HermesHypothesis,
  type Signal
} from "@workspace/db";
import { logger } from "./logger.js";
import { sendTelegramNotification } from "./telegram.js";

// In-memory reflection trigger state
let closedTradesSinceReflection = 0;
let isReflecting = false;
let lastReflectionTime = 0;

export interface HermesStateSummary {
  enabled: boolean;
  strategyVersion: string;
  reflectionCadence: number;
  closedTradesSinceReflection: number;
  tradesUntilNextReflection: number;
  maxDrawdownLimit: number;
  parameters: HermesParameters;
  latestHypothesis: HermesHypothesis | null;
  totalHypothesesCount: number;
  recentHypotheses: HermesHypothesis[];
}

/**
 * Bounds checker to guarantee AI parameter tuning stays strictly within safe trading limits
 */
function clampParameter(key: keyof HermesParameters, val: number): number {
  const BOUNDS: Record<keyof HermesParameters, { min: number; max: number; step: number }> = {
    minConfidenceNormal: { min: 45, max: 65, step: 1 },
    minConfidenceStrong: { min: 60, max: 75, step: 1 },
    minConfidenceReversal: { min: 55, max: 72, step: 1 },
    minConfidenceRange: { min: 50, max: 68, step: 1 },
    spikeAtrMultiplier: { min: 2.0, max: 4.0, step: 0.1 },
    rsiOversoldThreshold: { min: 25, max: 38, step: 1 },
    rsiOverboughtThreshold: { min: 62, max: 75, step: 1 },
    minAtrFilter: { min: 0.8, max: 2.5, step: 0.1 },
    asianSessionMinConfidence: { min: 50, max: 65, step: 1 },
  };

  const b = BOUNDS[key];
  if (!b) return val;
  const clamped = Math.max(b.min, Math.min(b.max, val));
  return Number(clamped.toFixed(2));
}

/**
 * Bump semver string: e.g. "v1.0.0" -> "v1.0.1"
 */
function bumpStrategyVersion(current = "v1.0.0"): string {
  const clean = current.replace(/^v/, "");
  const parts = clean.split(".").map(p => parseInt(p, 10) || 0);
  while (parts.length < 3) parts.push(0);
  parts[2] += 1;
  return `v${parts[0]}.${parts[1]}.${parts[2]}`;
}

/**
 * Analyze window of recent closed trades
 */
function analyzeTradePerformance(trades: Signal[]) {
  if (!trades || trades.length === 0) {
    return {
      total: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      netPnlPoints: 0,
      profitFactor: 1,
      maxDrawdownPoints: 0,
      asianTradesCount: 0,
      asianLossesCount: 0,
      reversalTradesCount: 0,
      reversalLossesCount: 0,
      quickStopoutsCount: 0,
    };
  }

  let wins = 0;
  let losses = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let peakCumulativePnl = 0;
  let runningPnl = 0;
  let maxDrawdownPoints = 0;
  let asianTradesCount = 0;
  let asianLossesCount = 0;
  let reversalTradesCount = 0;
  let reversalLossesCount = 0;
  let quickStopoutsCount = 0;

  // Process trades in chronological order (oldest to newest)
  const sorted = [...trades].sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return ta - tb;
  });

  for (const t of sorted) {
    const pnl = Number(t.pnlPoints ?? 0);
    runningPnl += pnl;
    if (runningPnl > peakCumulativePnl) peakCumulativePnl = runningPnl;
    const currentDrawdown = peakCumulativePnl - runningPnl;
    if (currentDrawdown > maxDrawdownPoints) maxDrawdownPoints = currentDrawdown;

    if (pnl > 0) {
      wins++;
      grossProfit += pnl;
    } else {
      losses++;
      grossLoss += Math.abs(pnl);
    }

    // Check Asian session performance
    const isAsian = t.session?.asian === true || t.session?.active === "Asian";
    if (isAsian) {
      asianTradesCount++;
      if (pnl <= 0) asianLossesCount++;
    }

    // Check reversal performance
    if (t.signalType === "REVERSAL") {
      reversalTradesCount++;
      if (pnl <= 0) reversalLossesCount++;
    }

    // Quick stopout check (closed within 25 minutes with a loss)
    const openTime = t.createdAt ? new Date(t.createdAt).getTime() : 0;
    const closeTime = t.closedAt ? new Date(t.closedAt).getTime() : 0;
    if (pnl < 0 && openTime > 0 && closeTime > 0 && (closeTime - openTime) < 25 * 60 * 1000) {
      quickStopoutsCount++;
    }
  }

  const total = wins + losses;
  const winRate = total > 0 ? Number(((wins / total) * 100).toFixed(1)) : 0;
  const netPnlPoints = Number((grossProfit - grossLoss).toFixed(2));
  const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : (grossProfit > 0 ? 5.0 : 1.0);

  return {
    total,
    wins,
    losses,
    winRate,
    netPnlPoints,
    profitFactor,
    maxDrawdownPoints: Number(maxDrawdownPoints.toFixed(2)),
    asianTradesCount,
    asianLossesCount,
    reversalTradesCount,
    reversalLossesCount,
    quickStopoutsCount,
  };
}

/**
 * Execute the autonomous Hermes reflection cycle.
 * Evaluates performance metrics against target goals, applies exactly ONE variable optimization or rollback,
 * and logs the versioned hypothesis.
 */
export async function runHermesReflection(manualTrigger = false): Promise<HermesHypothesis | null> {
  if (isReflecting) {
    logger.warn("[Hermes AI Brain] Reflection already in progress, skipping concurrent call");
    return null;
  }

  isReflecting = true;
  try {
    const settings = await getSystemSettings(true);
    if (!settings.hermesEnabled && !manualTrigger) {
      logger.info("[Hermes AI Brain] Hermes adaptive tuning is currently disabled in settings");
      return null;
    }

    const cadence = settings.hermesReflectionCadence || 5;
    const currentParams: HermesParameters = {
      ...DEFAULT_HERMES_PARAMETERS,
      ...(settings.hermesParameters || {}),
    };

    const currentVersion = settings.hermesStrategyVersion || "v1.0.0";
    const maxAllowedDdPoints = (settings.hermesMaxDrawdownLimit || 5.0) * 2; // e.g. 5% ≈ 10 points

    // Fetch closed trades window
    const recentTrades = await getClosedTrades(Math.max(cadence, 15));
    if (recentTrades.length === 0) {
      logger.info("[Hermes AI Brain] No closed trades available yet to evaluate reflection");
      return null;
    }

    const evaluationWindow = recentTrades.slice(0, Math.min(recentTrades.length, 25));
    const metrics = analyzeTradePerformance(evaluationWindow);

    const latestHypothesis = await getLatestHermesHypothesis();
    const cycleNumber = (latestHypothesis?.cycle || 0) + 1;

    let variableModified = "none";
    let previousValue: number | string = "N/A";
    let newValue: number | string = "N/A";
    let rationale = "";
    let actionTaken: HermesHypothesis["actionTaken"] = "PARAMETERS_MAINTAINED";
    let status: HermesHypothesis["status"] = "PROVEN_STABLE";

    const nextParams: HermesParameters = { ...currentParams };

    // ── STEP 1: SAFETY ROLLBACK CHECK ──
    // If the previous cycle was an active trial and drawdown exceeded limit or win rate collapsed
    if (latestHypothesis && latestHypothesis.actionTaken === "OPTIMIZATION_APPLIED" && latestHypothesis.status === "ACTIVE_TRIAL") {
      const isSevereDrawdown = metrics.maxDrawdownPoints > maxAllowedDdPoints;
      const isSevereWinRateDrop = metrics.winRate < 40 && metrics.total >= 4;

      if (isSevereDrawdown || isSevereWinRateDrop) {
        // Rollback the exact variable modified previously
        const prevKey = latestHypothesis.variableModified as keyof HermesParameters;
        if (prevKey && prevKey in currentParams && typeof latestHypothesis.previousValue === "number") {
          variableModified = prevKey;
          previousValue = currentParams[prevKey];
          newValue = latestHypothesis.previousValue;
          nextParams[prevKey] = latestHypothesis.previousValue;

          actionTaken = "ROLLBACK_TRIGGERED";
          status = "ROLLED_BACK";
          rationale = `Safety rollback: Window drawdown (${metrics.maxDrawdownPoints} pts) or Win Rate (${metrics.winRate}%) breached tolerance. Restored ${prevKey} to ${newValue}.`;
        }
      }
    }

    // ── STEP 2: HYPOTHESIS FORMULATION (ONE VARIABLE ONLY) ──
    if (actionTaken === "PARAMETERS_MAINTAINED") {
      // Branch A: Whipsaw & Quick Stopouts -> Increase normal confidence filter
      if (metrics.quickStopoutsCount >= 2 && metrics.winRate < 55) {
        variableModified = "minConfidenceNormal";
        previousValue = currentParams.minConfidenceNormal;
        const candidate = clampParameter("minConfidenceNormal", currentParams.minConfidenceNormal + 2);
        newValue = candidate;
        nextParams.minConfidenceNormal = candidate;
        actionTaken = "OPTIMIZATION_APPLIED";
        status = "ACTIVE_TRIAL";
        rationale = `Detected ${metrics.quickStopoutsCount} quick stopouts in recent trades. Raised normal entry conviction from ${previousValue}% to ${newValue}% to filter noisy breakouts.`;
      }
      // Branch B: Asian Session Vulnerability -> Tighten Asian session requirement
      else if (metrics.asianTradesCount >= 2 && (metrics.asianLossesCount / metrics.asianTradesCount) >= 0.6) {
        variableModified = "asianSessionMinConfidence";
        previousValue = currentParams.asianSessionMinConfidence;
        const candidate = clampParameter("asianSessionMinConfidence", currentParams.asianSessionMinConfidence + 2);
        newValue = candidate;
        nextParams.asianSessionMinConfidence = candidate;
        actionTaken = "OPTIMIZATION_APPLIED";
        status = "ACTIVE_TRIAL";
        rationale = `Asian session loss rate reached ${Math.round((metrics.asianLossesCount / metrics.asianTradesCount) * 100)}%. Raised Asian session confidence requirement from ${previousValue}% to ${newValue}%.`;
      }
      // Branch C: Reversal Trades Failing -> Raise reversal confidence threshold
      else if (metrics.reversalTradesCount >= 2 && (metrics.reversalLossesCount / metrics.reversalTradesCount) >= 0.5) {
        variableModified = "minConfidenceReversal";
        previousValue = currentParams.minConfidenceReversal;
        const candidate = clampParameter("minConfidenceReversal", currentParams.minConfidenceReversal + 2);
        newValue = candidate;
        nextParams.minConfidenceReversal = candidate;
        actionTaken = "OPTIMIZATION_APPLIED";
        status = "ACTIVE_TRIAL";
        rationale = `Counter-trend reversals experienced headwinds. Increased minimum reversal conviction from ${previousValue}% to ${newValue}%.`;
      }
      // Branch D: High Volatility Surge Losses -> Broaden spike protection shield
      else if (metrics.losses > metrics.wins && currentParams.spikeAtrMultiplier < 3.5) {
        variableModified = "spikeAtrMultiplier";
        previousValue = currentParams.spikeAtrMultiplier;
        const candidate = clampParameter("spikeAtrMultiplier", currentParams.spikeAtrMultiplier + 0.2);
        newValue = candidate;
        nextParams.spikeAtrMultiplier = candidate;
        actionTaken = "OPTIMIZATION_APPLIED";
        status = "ACTIVE_TRIAL";
        rationale = `Elevated volatility stopped out trades prematurely. Expanded spike guard multiplier from ${previousValue}x to ${newValue}x ATR.`;
      }
      // Branch E: Outstanding Performance (Win Rate >= 70%) -> Keep stable & certify baseline
      else if (metrics.winRate >= 70 && metrics.total >= 4) {
        actionTaken = "PARAMETERS_MAINTAINED";
        status = "PROVEN_STABLE";
        rationale = `Exceptional performance: Win Rate ${metrics.winRate}%, Profit Factor ${metrics.profitFactor}. System parameters are operating in high-probability resonance. Maintained baseline.`;
      }
      // Branch F: Steady Balanced Operation
      else {
        actionTaken = "PARAMETERS_MAINTAINED";
        status = "PROVEN_STABLE";
        rationale = `Balanced performance across ${metrics.total} trades (${metrics.winRate}% win rate, ${metrics.netPnlPoints > 0 ? "+" : ""}${metrics.netPnlPoints} pts). Monitoring next cadence.`;
      }
    }

    const newStrategyVersion = actionTaken !== "PARAMETERS_MAINTAINED" ? bumpStrategyVersion(currentVersion) : currentVersion;

    const hypothesisRecord: Omit<HermesHypothesis, "id"> = {
      cycle: cycleNumber,
      timestamp: new Date().toISOString(),
      strategyVersion: newStrategyVersion,
      previousVersion: currentVersion,
      tradesEvaluated: metrics.total,
      winRate: metrics.winRate,
      profitFactor: metrics.profitFactor,
      netPnlPoints: metrics.netPnlPoints,
      maxDrawdownPoints: metrics.maxDrawdownPoints,
      variableModified,
      previousValue,
      newValue,
      rationale,
      actionTaken,
      status,
    };

    const docId = await insertHermesHypothesis(hypothesisRecord);
    const savedHypothesis: HermesHypothesis = { ...hypothesisRecord, id: docId };

    // Update system settings with new parameters and version
    await updateSystemSettings({
      hermesStrategyVersion: newStrategyVersion,
      hermesParameters: nextParams,
    });

    // Reset reflection counter
    closedTradesSinceReflection = 0;
    lastReflectionTime = Date.now();

    logger.info(
      {
        cycle: cycleNumber,
        version: newStrategyVersion,
        actionTaken,
        variableModified,
        previousValue,
        newValue,
        winRate: metrics.winRate,
        netPnl: metrics.netPnlPoints,
      },
      "[Hermes AI Brain] Completed reflection cycle successfully"
    );

    // Send Telegram Notification
    const telegramMsg = `🧠 *HERMES AI BRAIN — REFLECTION CYCLE #${cycleNumber}*\n` +
      `*Version:* ${newStrategyVersion} (was ${currentVersion})\n` +
      `*Action:* ${actionTaken.replace(/_/g, " ")}\n` +
      `*Evaluated:* ${metrics.total} Trades | Win Rate: ${metrics.winRate}% | Net PnL: ${metrics.netPnlPoints > 0 ? "+" : ""}${metrics.netPnlPoints} pts\n` +
      (variableModified !== "none" ? `*Tweak:* \`${variableModified}\`: ${previousValue} ➔ ${newValue}\n` : "") +
      `*Reason:* ${rationale}`;

    sendTelegramNotification(telegramMsg).catch(() => {});

    return savedHypothesis;
  } catch (err: any) {
    logger.error({ err: err?.message || err }, "[Hermes AI Brain] Reflection cycle encountered an error");
    return null;
  } finally {
    isReflecting = false;
  }
}

/**
 * Hook called automatically whenever a trade closes in the tradeTracker
 */
export async function onTradeClosedHook(trade: Signal): Promise<void> {
  try {
    const settings = await getSystemSettings();
    if (!settings.hermesEnabled) return;

    closedTradesSinceReflection++;
    const cadence = settings.hermesReflectionCadence || 5;

    logger.info(
      { closedTradesSinceReflection, cadence, tradeId: trade.id, pnl: trade.pnlPoints },
      "[Hermes AI Brain] Incremented closed trade cadence counter"
    );

    if (closedTradesSinceReflection >= cadence) {
      logger.info(
        { closedTradesSinceReflection, cadence },
        "[Hermes AI Brain] Reflection cadence threshold reached! Triggering automated reflection loop..."
      );
      // Run asynchronously without blocking caller
      setTimeout(() => {
        runHermesReflection(false).catch(err => {
          logger.error({ err }, "[Hermes AI Brain] Error in automated reflection trigger");
        });
      }, 1000);
    }
  } catch (err) {
    logger.warn({ err }, "[Hermes AI Brain] Failed in onTradeClosedHook");
  }
}

/**
 * Retrieve current active Hermes parameters for signal engine calculation
 */
export async function getActiveHermesParameters(): Promise<HermesParameters> {
  try {
    const settings = await getSystemSettings();
    if (!settings.hermesEnabled) {
      return { ...DEFAULT_HERMES_PARAMETERS };
    }
    return {
      ...DEFAULT_HERMES_PARAMETERS,
      ...(settings.hermesParameters || {}),
    };
  } catch {
    return { ...DEFAULT_HERMES_PARAMETERS };
  }
}

/**
 * Get comprehensive Hermes state for dashboard API
 */
export async function getHermesStateSummary(): Promise<HermesStateSummary> {
  const settings = await getSystemSettings();
  const cadence = settings.hermesReflectionCadence || 5;
  const recentHypotheses = await getHermesHypotheses(10);
  const latestHypothesis = recentHypotheses.length > 0 ? recentHypotheses[0] : null;

  return {
    enabled: settings.hermesEnabled ?? true,
    strategyVersion: settings.hermesStrategyVersion || "v1.0.0",
    reflectionCadence: cadence,
    closedTradesSinceReflection,
    tradesUntilNextReflection: Math.max(0, cadence - closedTradesSinceReflection),
    maxDrawdownLimit: settings.hermesMaxDrawdownLimit || 5.0,
    parameters: {
      ...DEFAULT_HERMES_PARAMETERS,
      ...(settings.hermesParameters || {}),
    },
    latestHypothesis,
    totalHypothesesCount: recentHypotheses.length,
    recentHypotheses,
  };
}

/**
 * Reset Hermes parameters and version to factory baseline
 */
export async function resetHermesToDefault(): Promise<HermesStateSummary> {
  await updateSystemSettings({
    hermesStrategyVersion: "v1.0.0",
    hermesParameters: { ...DEFAULT_HERMES_PARAMETERS },
  });
  closedTradesSinceReflection = 0;
  lastReflectionTime = Date.now();

  const hypothesisRecord: Omit<HermesHypothesis, "id"> = {
    cycle: 0,
    timestamp: new Date().toISOString(),
    strategyVersion: "v1.0.0",
    previousVersion: "custom",
    tradesEvaluated: 0,
    winRate: 0,
    profitFactor: 1.0,
    netPnlPoints: 0,
    maxDrawdownPoints: 0,
    variableModified: "ALL_RESET",
    previousValue: "Custom",
    newValue: "Factory Baseline",
    rationale: "System parameters reset to conservative factory defaults.",
    actionTaken: "PARAMETERS_MAINTAINED",
    status: "PROVEN_STABLE",
  };
  await insertHermesHypothesis(hypothesisRecord);
  return getHermesStateSummary();
}
