import { pgTable, text, serial, real, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const signalsTable = pgTable("signals", {
  id: serial("id").primaryKey(),
  signal: text("signal").notNull(),
  confidence: real("confidence").notNull(),
  entryPrice: real("entry_price").notNull(),
  stopLoss: real("stop_loss").notNull(),
  takeProfit: real("take_profit").notNull(),
  trend: text("trend").notNull(),
  reason: text("reason").notNull(),
  tradeDuration: text("trade_duration").notNull().default("5-15 minutes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Trade outcome tracking
  tradeStatus: text("trade_status").notNull().default("RUNNING"),
  closedPrice: real("closed_price"),
  closedAt: timestamp("closed_at"),
  pnlPoints: real("pnl_points"),
  // SMC condition columns — used for per-condition accuracy + adaptive weights
  marketStructure: text("market_structure"),          // UPTREND | DOWNTREND | RANGING
  bosPresent: boolean("bos_present"),                 // Break of Structure detected?
  liquiditySweep: boolean("liquidity_sweep"),         // Liquidity grab detected?
  inOrderBlock: boolean("in_order_block"),            // Price in Order Block?
  smcScore: real("smc_score"),                        // Raw SMC confluence % at signal time
  obScore: integer("ob_score"),                       // Order Block score (0/10/18/25)
  obType: text("ob_type"),                            // "bullish" | "bearish" | null
  obHigh: real("ob_high"),
  obLow: real("ob_low"),
  signalType: text("signal_type"),                    // "TREND_FOLLOW" | "REVERSAL"
  candlePattern: text("candle_pattern"),              // e.g. "Hammer", "Shooting Star", null
  candleScore: integer("candle_score"),               // -10 | 0 | 20
});

export const insertSignalSchema = createInsertSchema(signalsTable)
  .omit({ id: true, createdAt: true })
  .extend({
    obScore: z.number().optional(),
    obType:  z.string().optional(),
    obHigh:  z.number().optional(),
    obLow:   z.number().optional(),
  });
export type InsertSignal = z.infer<typeof insertSignalSchema>;
export type Signal = typeof signalsTable.$inferSelect;

export const pushSubscriptionsTable = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PushSubscription = typeof pushSubscriptionsTable.$inferSelect;
