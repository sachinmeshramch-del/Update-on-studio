export interface HermesParameters {
  minConfidenceNormal: number; // default: 50, range [45, 65]
  minConfidenceStrong: number; // default: 65, range [60, 75]
  minConfidenceReversal: number; // default: 60, range [55, 72]
  minConfidenceRange: number; // default: 55, range [50, 68]
  spikeAtrMultiplier: number; // default: 2.5, range [2.0, 4.0]
  rsiOversoldThreshold: number; // default: 30, range [25, 38]
  rsiOverboughtThreshold: number; // default: 70, range [62, 75]
  minAtrFilter: number; // default: 1.2, range [0.8, 2.5]
  asianSessionMinConfidence: number; // default: 55, range [50, 65]
}

export interface HermesHypothesis {
  id?: string;
  cycle: number;
  timestamp: string;
  strategyVersion: string;
  previousVersion: string;
  tradesEvaluated: number;
  winRate: number; // e.g. 60.0%
  profitFactor: number; // e.g. 1.85
  netPnlPoints: number; // e.g. +7.4
  maxDrawdownPoints: number; // e.g. 3.2
  variableModified: string; // e.g. "minConfidenceNormal"
  previousValue: number | string;
  newValue: number | string;
  rationale: string;
  actionTaken: "OPTIMIZATION_APPLIED" | "ROLLBACK_TRIGGERED" | "PARAMETERS_MAINTAINED";
  status: "ACTIVE_TRIAL" | "PROVEN_STABLE" | "ROLLED_BACK";
  createdAt?: Date | string;
}
