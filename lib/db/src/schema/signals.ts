export interface Signal {
  id: string;
  signal: string;
  confidence: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  trend: string;
  reason: string;
  tradeDuration: string;
  createdAt: Date;
  tradeStatus: string;
  closedPrice: number | null;
  closedAt: Date | null;
  pnlPoints: number | null;
  marketStructure: string | null;
  bosPresent: boolean | null;
  liquiditySweep: boolean | null;
  inOrderBlock: boolean | null;
  smcScore: number | null;
  obScore: number | null;
  obType: string | null;
  obHigh: number | null;
  obLow: number | null;
  signalType: string | null;
  candlePattern: string | null;
  candleScore: number | null;
  isRealTrade?: boolean | null;
  brokerPositionId?: string | null;
}

export type InsertSignal = Omit<Signal, 'id' | 'createdAt'>;

export interface PushSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: Date;
}
