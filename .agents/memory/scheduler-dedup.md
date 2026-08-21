---
name: Scheduler deduplication — DB-backed RUNNING guard
description: Why the scheduler was writing duplicate signals and how the fix works
---

## Rule
Before inserting any new signal, the scheduler queries the DB for an existing RUNNING signal in the same direction. If one exists, it skips the insert entirely.

**Why:** `lastPushedSignalTime` was an in-memory variable that reset to 0 on every server restart. On restart the signal engine's 2-minute cache replays the last LONG/SHORT immediately; the old 55-second in-memory guard was bypassed since `now - 0 >> 55_000`. The result: every restart produced a duplicate row with identical entry/SL/TP. DB query showed this happened at least 5 times (pairs/triples 60 seconds apart).

**How to apply:** `signalScheduler.ts` — the DB check is the *only* dedup guard now. `lastPushedSignalTime` was removed entirely. The engine's `MIN_SIGNAL_INTERVAL_MS` / `initSignalCooldown` handles the signal engine side; the scheduler guard handles the persistence side.

## Related: Trade tracker startup false closes (`tradeTracker.ts`)

`checkRunningTrades()` used to fire immediately on startup. At that moment `getLatestPrice()` returns null (WebSocket not yet connected, ~700ms lag). The HTTP fallback (`fetchGoldPrice`) could return a spiked or stale price, causing legitimate RUNNING trades to be falsely marked TARGET_HIT or STOP_HIT.

**Fix applied:** Removed the immediate startup call entirely. Tracker now only runs on the 10-second interval — by then both WebSockets have delivered at least one verified tick. Also hardened the price guard: if `getLatestPrice()` returns null, skip the cycle entirely (no HTTP fallback allowed in the tracker).
