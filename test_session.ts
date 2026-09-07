function getCurrentSession() {
  const now = new Date();
  // Use America/New_York timezone to perfectly handle Daylight Saving Time
  const nyFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "numeric",
    minute: "numeric",
    weekday: "short"
  });
  const parts = nyFormatter.formatToParts(now);
  let nyHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
  if (nyHour === 24) nyHour = 0;
  const nyDayStr = parts.find(p => p.type === 'weekday')?.value;

  // NY Close is Friday 5 PM. Opens Sunday 5 PM.
  // Daily break is 5 PM to 6 PM NY time (17:00 to 18:00)
  const isWeekend = nyDayStr === 'Sat' || (nyDayStr === 'Fri' && nyHour >= 17) || (nyDayStr === 'Sun' && nyHour < 17);
  const isDailyBreak = !isWeekend && nyHour === 17;

  const marketOpen = !isWeekend && !isDailyBreak;

  const h = now.getUTCHours(); // Keep basic UTC hours for session names
  const london  = marketOpen && h >= 7  && h < 17;
  const newYork = marketOpen && h >= 13 && h < 22;
  const asian   = marketOpen && (h >= 22 || h < 7);

  const active =
    !marketOpen       ? "Market Closed" :
    london && newYork ? "London / New York" :
    london            ? "London" :
    newYork           ? "New York" :
    asian             ? "Asian" :
    "Off-hours";

  return { london, newYork, asian, active, marketOpen, nyDayStr, nyHour };
}
console.log(getCurrentSession());
