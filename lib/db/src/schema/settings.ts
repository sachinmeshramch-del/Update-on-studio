export interface SystemSettings {
  id?: string;
  demoAccountId?: string;
  realAccountId: string;
  autoTradingDemoEnabled?: boolean;
  autoTradingRealEnabled: boolean;
  autoTradingEnabled?: boolean;
  metaApiSymbol?: string;
  tradingMode?: "DEMO" | "REAL";
  riskPerTradePercent?: number;
  dailyProfitTargetPercent?: number;
  dailyStopLossPercent?: number;
  dashboardPasscode?: string;
  disableCooldowns?: boolean;
  hermesEnabled?: boolean;
  hermesReflectionCadence?: number; // default: 5
  hermesMaxDrawdownLimit?: number; // default: 5.0 (%)
  hermesStrategyVersion?: string; // e.g. "v1.0.0"
  hermesParameters?: {
    minConfidenceNormal: number;
    minConfidenceStrong: number;
    minConfidenceReversal: number;
    minConfidenceRange: number;
    spikeAtrMultiplier: number;
    rsiOversoldThreshold: number;
    rsiOverboughtThreshold: number;
    minAtrFilter: number;
    asianSessionMinConfidence: number;
  };
  engineMode?: "HYBRID_DUAL" | "DETERMINISTIC_ORB" | "HERMES_ADAPTIVE";
  orbRiskPerTrade?: number;
  orbTargetMultiple?: number;
  orbStopAtrMultiplier?: number;
  orbAllowLondonSession?: boolean;
  orbNewsFilterEnabled?: boolean;
  // Quantitative Reviewer Feature Flags
  featureStructuralStop?: boolean; // default: true
  featureEntryConfirmation?: boolean; // default: true
  featureContextPatternFilter?: boolean; // default: true
  featureSpreadGuard?: boolean; // default: true
  featureSessionFilter?: boolean; // default: true
  tradingState?: "ACTIVE" | "PAUSED";
}
