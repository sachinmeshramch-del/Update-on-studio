import fs from "fs";
import path from "path";
import { getNyTimeComponents, evaluateSessionWindow, DEFAULT_ICT_SILVER_BULLET_CONFIG } from "./ictSilverBulletEngine.js";

interface CsvTrade {
  TradeId: string;
  EntryTime: string;
  ExitTime: string;
  Direction: "LONG" | "SHORT";
  Pattern: string;
  Session: string;
  Regime: string;
  LotSize: number;
  Leverage: number;
  RequiredMargin: number;
  MarginUsagePercent: number;
  EntryPrice: number;
  StopLoss: number;
  TakeProfit: number;
  ExitPrice: number;
  PnLPoints: number;
  PnLDollars: number;
  ROutcome: number;
  Outcome: "WIN" | "LOSS";
  MAEPoints: number;
  MFEPoints: number;
  DurationMinutes: number;
  BalanceAfter: number;
  RunnerActivated: boolean;
  ExitReason: string;
}

const rawCsv = `TradeId,EntryTime,ExitTime,Direction,Pattern,Session,Regime,LotSize,Leverage,RequiredMargin,MarginUsagePercent,EntryPrice,StopLoss,TakeProfit,ExitPrice,PnLPoints,PnLDollars,ROutcome,Outcome,MAEPoints,MFEPoints,DurationMinutes,BalanceAfter,RunnerActivated,ExitReason
BT-1,2026-06-03T12:15:00.000Z,2026-06-03T12:30:00.000Z,SHORT,"ICT Silver Bullet (BEARISH Sweep)",London/NY Overlap,TRENDING,0.01,1000,4.45,5.71,4452.26,4458.06,4437.76,4451.26,1,1,0.17,WIN,8.31,3.94,15,79,FALSE,TRAILING_STOP
BT-2,2026-06-29T08:30:00.000Z,2026-06-29T08:45:00.000Z,SHORT,"ICT Silver Bullet (BEARISH Sweep)",London,TRENDING,0.01,1000,4.06,5.14,4055.23,4061.03,4040.73,4047.23,8,8,1.38,WIN,2.15,11.53,15,87,TRUE,TRAILING_STOP
BT-3,2026-07-03T16:30:00.000Z,2026-07-03T16:45:00.000Z,LONG,"ICT Silver Bullet (BULLISH Sweep)",New York,TRENDING,0.01,1000,4.17,4.79,4170.24,4164.44,4184.74,4172.74,2.5,2.5,0.43,WIN,0.94,5.16,15,89.5,FALSE,TRAILING_STOP
BT-4,2026-07-07T08:45:00.000Z,2026-07-07T09:15:00.000Z,SHORT,"ICT Silver Bullet (BEARISH Sweep)",London,TRENDING,0.01,1000,4.13,4.61,4125.51,4131.31,4111.01,4123.01,2.5,2.5,0.43,WIN,5.53,5.68,30,92,FALSE,TRAILING_STOP
BT-5,2026-07-13T09:15:00.000Z,2026-07-13T09:45:00.000Z,SHORT,"ICT Silver Bullet (BEARISH Sweep)",London,TRENDING,0.01,1000,4.07,4.42,4072.21,4078.01,4057.71,4071.21,1,1,0.17,WIN,1.84,4.02,30,93,FALSE,TRAILING_STOP
BT-6,2026-07-30T08:15:00.000Z,2026-07-30T08:30:00.000Z,LONG,"ICT Silver Bullet (BULLISH Sweep)",London,TRENDING,0.01,1000,4.06,4.37,4064.72,4058.92,4079.22,4069.22,4.5,4.5,0.78,WIN,2.13,7.79,15,97.5,FALSE,TRAILING_STOP
BT-7,2026-08-31T08:30:00.000Z,2026-08-31T09:00:00.000Z,SHORT,"ICT Silver Bullet (BEARISH Sweep)",London,TRENDING,0.01,1000,4.43,4.54,4434.94,4440.74,4420.44,4438.54,-3.6,-3.6,-0.62,LOSS,8.07,1.1,30,93.9,FALSE,STOP_LOSS
BT-8,2026-09-02T08:30:00.000Z,2026-09-02T08:45:00.000Z,SHORT,"ICT Silver Bullet (BEARISH Sweep)",London,TRENDING,0.01,1000,4.32,4.6,4321.48,4327.28,4306.98,4316.98,4.5,4.5,0.78,WIN,1.17,8.88,15,98.4,FALSE,TRAILING_STOP
BT-9,2026-09-18T16:45:00.000Z,2026-09-18T17:00:00.000Z,LONG,"ICT Silver Bullet (BULLISH Sweep)",New York,TRENDING,0.01,1000,4.38,4.45,4382.87,4377.07,4397.37,4383.87,1,1,0.17,WIN,1.64,3.97,15,99.4,FALSE,TRAILING_STOP
BT-10,2026-09-25T16:15:00.000Z,2026-09-25T16:30:00.000Z,LONG,"ICT Silver Bullet (BULLISH Sweep)",New York,TRENDING,0.01,1000,4.29,4.32,4292.36,4286.56,4306.86,4286.56,-5.8,-5.8,-1,LOSS,13.31,0.43,15,93.6,FALSE,STOP_LOSS`;

export function parseTrades(): CsvTrade[] {
  const lines = rawCsv.split("\n").filter(l => l.trim().length > 0);
  const trades: CsvTrade[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",");
    trades.push({
      TradeId: row[0],
      EntryTime: row[1],
      ExitTime: row[2],
      Direction: row[3].replace(/"/g, "") as "LONG" | "SHORT",
      Pattern: row[4].replace(/"/g, ""),
      Session: row[5].replace(/"/g, ""),
      Regime: row[6].replace(/"/g, ""),
      LotSize: parseFloat(row[7]),
      Leverage: parseFloat(row[8]),
      RequiredMargin: parseFloat(row[9]),
      MarginUsagePercent: parseFloat(row[10]),
      EntryPrice: parseFloat(row[11]),
      StopLoss: parseFloat(row[12]),
      TakeProfit: parseFloat(row[13]),
      ExitPrice: parseFloat(row[14]),
      PnLPoints: parseFloat(row[15]),
      PnLDollars: parseFloat(row[16]),
      ROutcome: parseFloat(row[17]),
      Outcome: row[18] as "WIN" | "LOSS",
      MAEPoints: parseFloat(row[19]),
      MFEPoints: parseFloat(row[20]),
      DurationMinutes: parseFloat(row[21]),
      BalanceAfter: parseFloat(row[22]),
      RunnerActivated: row[23].toLowerCase() === "true",
      ExitReason: row[24],
    });
  }
  return trades;
}

export function performAudit(): void {
  const trades = parseTrades();
  const auditedRows: any[] = [];

  for (const t of trades) {
    const entryNy = getNyTimeComponents(t.EntryTime);
    const exitNy = getNyTimeComponents(t.ExitTime);
    
    const timeInMins = entryNy.hour * 60 + entryNy.minute;
    const isLondonSbWindow = timeInMins >= 3 * 60 && timeInMins <= 4 * 60;
    const isNyMorningSbWindow = timeInMins >= 10 * 60 && timeInMins <= 11 * 60;
    const isNyAfternoonSbWindow = timeInMins >= 14 * 60 && timeInMins <= 15 * 60;

    const isPermittedInSb = isLondonSbWindow || isNyMorningSbWindow || isNyAfternoonSbWindow;
    
    let expectedWindowName = "OFF_SESSION";
    if (isLondonSbWindow) expectedWindowName = "LONDON_MORNING (03:00-04:00 AM NY)";
    else if (isNyMorningSbWindow) expectedWindowName = "NY_MORNING (10:00-11:00 AM NY)";
    else if (isNyAfternoonSbWindow) expectedWindowName = "NY_AFTERNOON (02:00-03:00 PM NY)";

    let mismatchReason = "None (Permitted)";
    if (!isPermittedInSb) {
      mismatchReason = `Entry time ${entryNy.hour.toString().padStart(2,"0")}:${entryNy.minute.toString().padStart(2,"0")} NY Local (${entryNy.isDst ? "EDT" : "EST"}) falls outside 1h Silver Bullet windows`;
    }

    let activeStopAtExit = t.StopLoss;
    if (t.ExitReason === "TRAILING_STOP" || t.ExitReason === "STOP_LOSS") {
      activeStopAtExit = t.ExitPrice;
    }

    auditedRows.push({
      TradeId: t.TradeId,
      EntryTimeUtc: t.EntryTime,
      EntryTimeNy: entryNy.isoNy,
      ExitTimeUtc: t.ExitTime,
      ExitTimeNy: exitNy.isoNy,
      Direction: t.Direction,
      Pattern: t.Pattern,
      ConfiguredSessionInCsv: t.Session,
      ExpectedSilverBulletSession: expectedWindowName,
      SessionPermitted: isPermittedInSb ? "TRUE" : "FALSE",
      MismatchReason: mismatchReason,
      EntryPrice: t.EntryPrice,
      InitialStopLoss: t.StopLoss,
      ActiveStopAtExit: activeStopAtExit,
      TakeProfit: t.TakeProfit,
      ExitPrice: t.ExitPrice,
      PnLPoints: t.PnLPoints,
      PnLDollars: t.PnLDollars,
      ROutcome: t.ROutcome,
      Outcome: t.Outcome,
      MAEPoints: t.MAEPoints,
      MFEPoints: t.MFEPoints,
      DurationMinutes: t.DurationMinutes,
      RunnerActivated: t.RunnerActivated ? "TRUE" : "FALSE",
      ExitReason: t.ExitReason,
      SetupSequenceStatus: isPermittedInSb ? "LIQUIDITY_SWEPT -> MSS -> FVG -> ENTRY_FILLED" : "INVALIDATED (OFF_SESSION_ENTRY)",
    });
  }

  const csvHeaders = Object.keys(auditedRows[0]).join(",");
  const csvLines = auditedRows.map(r => Object.values(r).map(v => typeof v === "string" && v.includes(" ") ? `"${v}"` : v).join(","));
  const updatedCsvContent = [csvHeaders, ...csvLines].join("\n");

  const outPath = path.resolve(process.cwd(), "public", "assets", "aistudio", "backtest_15m_10trades_audited.csv");
  fs.writeFileSync(outPath, updatedCsvContent, "utf-8");
}

performAudit();
