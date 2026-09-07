import { getLatestPrice } from "./artifacts/api-server/src/lib/priceEvents.js";
setInterval(() => {
  const p = getLatestPrice();
  if (p) console.log(p.price, p.ms, new Date(p.ms).toISOString());
  else console.log("null");
}, 1000);
