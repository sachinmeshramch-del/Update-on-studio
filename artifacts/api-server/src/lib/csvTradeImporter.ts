import type { InsertSignal } from "@workspace/db";
import { insertMultipleSignals } from "@workspace/db";
import { logger } from "./logger.js";

export interface ParsedCsvResult {
  success: boolean;
  importedCount: number;
  skippedCount: number;
  errors: string[];
  tradesPreview: Array<{
    signal: string;
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    closedPrice: number | null;
    pnlPoints: number | null;
    tradeStatus: string;
    timestamp: string;
  }>;
}

/**
 * Normalizes header keys to lowercase alphanumeric tokens
 */
function cleanKey(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Parses diverse date/time formats into a valid JavaScript Date
 */
function parseDate(raw: string): Date {
  if (!raw) return new Date();
  const trimmed = raw.trim();

  // Try standard ISO or direct Date parse
  const direct = new Date(trimmed);
  if (!isNaN(direct.getTime())) return direct;

  // Handle "YYYY.MM.DD HH:mm:ss" (MT4 / MT5 format)
  const mt5Match = trimmed.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (mt5Match) {
    const [, year, month, day, hour = "0", min = "0", sec = "0"] = mt5Match;
    return new Date(Date.UTC(+year, +month - 1, +day, +hour, +min, +sec));
  }

  // Handle "DD/MM/YYYY HH:mm"
  const dmyMatch = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (dmyMatch) {
    const [, day, month, year, hour = "0", min = "0", sec = "0"] = dmyMatch;
    return new Date(Date.UTC(+year, +month - 1, +day, +hour, +min, +sec));
  }

  return new Date();
}

/**
 * Splits CSV string handling quotes and commas
 */
function parseCsvLine(line: string, delimiter = ","): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' || char === "'") {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim().replace(/^["']|["']$/g, ""));
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^["']|["']$/g, ""));
  return result;
}

/**
 * Ingests and saves raw CSV trades to the signals database
 */
export async function parseAndImportTradeCsv(csvContent: string): Promise<ParsedCsvResult> {
  const lines = csvContent
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith("#"));

  if (lines.length < 2) {
    return {
      success: false,
      importedCount: 0,
      skippedCount: 0,
      errors: ["CSV file must contain a header row and at least one trade row."],
      tradesPreview: [],
    };
  }

  // Detect delimiter (comma vs semicolon vs tab)
  const firstLine = lines[0];
  const delimiter = firstLine.includes(";") ? ";" : firstLine.includes("\t") ? "\t" : ",";

  const rawHeaders = parseCsvLine(firstLine, delimiter);
  const headers = rawHeaders.map(cleanKey);

  // Column index finders
  const findCol = (...aliases: string[]): number => {
    for (const alias of aliases) {
      const idx = headers.findIndex(h => h.includes(alias));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const colTime = findCol("time", "date", "createdat", "opentime", "timestamp");
  const colSignal = findCol("signal", "type", "direction", "side", "order");
  const colEntry = findCol("entryprice", "entry", "openprice", "price", "open");
  const colSl = findCol("stoploss", "sl", "stop");
  const colTp = findCol("takeprofit", "tp", "target", "profitprice");
  const colClosePrice = findCol("closedprice", "closeprice", "exitprice", "close");
  const colCloseTime = findCol("closedat", "closetime", "exittime");
  const colPnlPoints = findCol("pnlpoints", "points", "pts", "pnl", "profit");
  const colStatus = findCol("tradestatus", "status", "result", "outcome");
  const colReason = findCol("reason", "comment", "notes", "setup");
  const colPattern = findCol("pattern", "candlepattern", "signaltype");
  const colTicket = findCol("ticket", "orderid", "positionid", "id");

  if (colSignal === -1 || colEntry === -1) {
    return {
      success: false,
      importedCount: 0,
      skippedCount: 0,
      errors: [
        `Required columns not recognized. Found headers: [${rawHeaders.join(", ")}]. Must include Direction (Signal/Type) and Entry Price.`,
      ],
      tradesPreview: [],
    };
  }

  const validSignalsToInsert: Array<InsertSignal & { createdAt: Date }> = [];
  const errors: string[] = [];
  let skippedCount = 0;

  for (let rowIdx = 1; rowIdx < lines.length; rowIdx++) {
    const rawLine = lines[rowIdx];
    const cells = parseCsvLine(rawLine, delimiter);
    if (cells.length < 2) continue;

    try {
      // 1. Direction / Signal
      const rawDir = (cells[colSignal] || "").toUpperCase().trim();
      let signal: "LONG" | "SHORT" | null = null;
      if (rawDir.includes("BUY") || rawDir.includes("LONG")) signal = "LONG";
      else if (rawDir.includes("SELL") || rawDir.includes("SHORT")) signal = "SHORT";

      if (!signal) {
        skippedCount++;
        continue;
      }

      // 2. Entry Price
      const entryPrice = parseFloat((cells[colEntry] || "").replace(/[^0-9.-]/g, ""));
      if (isNaN(entryPrice) || entryPrice <= 0) {
        skippedCount++;
        continue;
      }

      // 3. Stop Loss & Take Profit
      let stopLoss = colSl !== -1 ? parseFloat((cells[colSl] || "").replace(/[^0-9.-]/g, "")) : NaN;
      let takeProfit = colTp !== -1 ? parseFloat((cells[colTp] || "").replace(/[^0-9.-]/g, "")) : NaN;

      if (isNaN(stopLoss) || stopLoss <= 0) {
        stopLoss = signal === "LONG" ? Number((entryPrice - 6.5).toFixed(2)) : Number((entryPrice + 6.5).toFixed(2));
      }
      if (isNaN(takeProfit) || takeProfit <= 0) {
        const dist = Math.abs(entryPrice - stopLoss) * 2.5;
        takeProfit = signal === "LONG" ? Number((entryPrice + dist).toFixed(2)) : Number((entryPrice - dist).toFixed(2));
      }

      // 4. Closed Price & PnL Points
      let closedPrice = colClosePrice !== -1 ? parseFloat((cells[colClosePrice] || "").replace(/[^0-9.-]/g, "")) : NaN;
      let pnlPoints = colPnlPoints !== -1 ? parseFloat((cells[colPnlPoints] || "").replace(/[^0-9.-]/g, "")) : NaN;

      if (!isNaN(closedPrice) && isNaN(pnlPoints)) {
        pnlPoints = signal === "LONG" ? Number((closedPrice - entryPrice).toFixed(2)) : Number((entryPrice - closedPrice).toFixed(2));
      } else if (!isNaN(pnlPoints) && isNaN(closedPrice)) {
        closedPrice = signal === "LONG" ? Number((entryPrice + pnlPoints).toFixed(2)) : Number((entryPrice - pnlPoints).toFixed(2));
      }

      // 5. Trade Status
      let tradeStatus = "CLOSED";
      const rawStatus = colStatus !== -1 ? (cells[colStatus] || "").toUpperCase() : "";
      if (rawStatus.includes("TARGET") || rawStatus.includes("WIN") || rawStatus.includes("TP")) {
        tradeStatus = "TARGET_HIT";
      } else if (rawStatus.includes("STOP") || rawStatus.includes("LOSS") || rawStatus.includes("SL")) {
        tradeStatus = "STOP_HIT";
      } else if (rawStatus.includes("RUN") || rawStatus.includes("OPEN")) {
        tradeStatus = "RUNNING";
        closedPrice = null as any;
        pnlPoints = null as any;
      } else if (!isNaN(pnlPoints)) {
        tradeStatus = pnlPoints >= 0 ? "TARGET_HIT" : "STOP_HIT";
      }

      // 6. Dates
      const createdAt = colTime !== -1 ? parseDate(cells[colTime]) : new Date(Date.now() - rowIdx * 3600 * 1000);
      const closedAt = colCloseTime !== -1 ? parseDate(cells[colCloseTime]) : new Date(createdAt.getTime() + 45 * 60 * 1000);

      const ticket = colTicket !== -1 ? cells[colTicket] : null;
      const reason = colReason !== -1 ? cells[colReason] : "Imported historical trade";
      const pattern = colPattern !== -1 ? cells[colPattern] : "HISTORICAL_IMPORT";

      const signalRecord: InsertSignal & { createdAt: Date } = {
        signal,
        confidence: 75,
        entryPrice: Number(entryPrice.toFixed(2)),
        stopLoss: Number(stopLoss.toFixed(2)),
        takeProfit: Number(takeProfit.toFixed(2)),
        trend: signal === "LONG" ? "BULLISH" : "BEARISH",
        reason: reason.slice(0, 200),
        tradeDuration: "45m",
        createdAt,
        tradeStatus,
        closedPrice: !isNaN(closedPrice) ? Number(closedPrice.toFixed(2)) : null,
        closedAt: tradeStatus !== "RUNNING" ? closedAt : null,
        pnlPoints: !isNaN(pnlPoints) ? Number(pnlPoints.toFixed(2)) : null,
        marketStructure: "CONFIRMED",
        bosPresent: true,
        liquiditySweep: true,
        inOrderBlock: false,
        smcScore: 80,
        obScore: 70,
        obType: null,
        obHigh: null,
        obLow: null,
        signalType: pattern.slice(0, 30),
        candlePattern: pattern.slice(0, 30),
        candleScore: 80,
        isRealTrade: true,
        brokerPositionId: ticket ? String(ticket).slice(0, 30) : null,
        executionStatus: "EXECUTED",
        executionReason: "Imported via CSV trade journal",
        executionType: "CSV_IMPORT",
      };

      validSignalsToInsert.push(signalRecord);
    } catch (err: any) {
      skippedCount++;
      errors.push(`Row ${rowIdx + 1}: ${err.message || "Failed to parse"}`);
    }
  }

  if (validSignalsToInsert.length === 0) {
    return {
      success: false,
      importedCount: 0,
      skippedCount,
      errors: errors.length > 0 ? errors.slice(0, 5) : ["No valid trades could be extracted from CSV."],
      tradesPreview: [],
    };
  }

  // Insert to DB in batches
  const insertedCount = await insertMultipleSignals(validSignalsToInsert);
  logger.info({ count: insertedCount, skipped: skippedCount }, "[CSV Import] Successfully imported historical trades to database");

  const tradesPreview = validSignalsToInsert.slice(0, 5).map(t => ({
    signal: t.signal,
    entryPrice: t.entryPrice,
    stopLoss: t.stopLoss,
    takeProfit: t.takeProfit,
    closedPrice: t.closedPrice,
    pnlPoints: t.pnlPoints,
    tradeStatus: t.tradeStatus,
    timestamp: t.createdAt.toISOString(),
  }));

  return {
    success: true,
    importedCount,
    skippedCount,
    errors: errors.slice(0, 5),
    tradesPreview,
  };
}

/**
 * Returns a standard CSV template for user reference
 */
export function getSampleCsvTemplate(): string {
  return [
    "Time,Direction,EntryPrice,StopLoss,TakeProfit,ClosePrice,CloseTime,PnLPoints,Status,Ticket,Reason",
    "2026-10-10 08:30:00,BUY,4125.50,4119.00,4141.75,4141.75,2026-10-10 10:15:00,16.25,TARGET_HIT,8910245,London breakout confirmation above 15m order block",
    "2026-10-11 13:45:00,SELL,4148.20,4154.50,4132.45,4154.50,2026-10-11 14:30:00,-6.30,STOP_HIT,8911022,NY open reversal rejection at daily supply zone",
    "2026-10-12 09:10:00,BUY,4130.80,4124.30,4147.05,4147.05,2026-10-12 11:00:00,16.25,TARGET_HIT,8912389,Bullish engulfing + liquidity sweep at 4128",
    "2026-10-13 14:00:00,SELL,4160.10,4153.80,4175.85,4153.80,2026-10-13 15:20:00,6.30,TARGET_HIT,8913490,Trend follow rejection off 1H EMA21",
    "2026-10-14 07:15:00,BUY,4135.40,4129.00,4151.40,4129.00,2026-10-14 08:00:00,-6.40,STOP_HIT,8914801,London open fakeout sweep before continuation",
  ].join("\n");
}
