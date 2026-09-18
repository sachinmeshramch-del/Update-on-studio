import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore';
import fs from 'fs';
import MetaApi from 'metaapi.cloud-sdk';

const rawConfig = fs.readFileSync('./firebase-applet-config.json', 'utf8');
const config = JSON.parse(rawConfig);
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

const token = process.env.META_API_TOKEN;
if (!token) {
    console.error("META_API_TOKEN missing in environment.");
    process.exit(1);
}
const metaApi = new MetaApi(token);

async function run() {
  console.log("Fetching last 5 real trades from Firebase...");
  const q = query(
    collection(db, "trades"),
    where("isRealTrade", "==", true),
    orderBy("createdAt", "desc"),
    limit(5)
  );
  const snap = await getDocs(q);
  const dbTrades = [];
  snap.forEach(doc => {
    dbTrades.push({ id: doc.id, ...doc.data() });
  });

  if (dbTrades.length === 0) {
    console.log("No real trades found in DB to cross-reference.");
    return;
  }

  // Get settings to find active real account
  const settingsSnap = await getDocs(collection(db, "settings"));
  let realAccountId = null;
  settingsSnap.forEach(doc => {
    if (doc.id === "general") realAccountId = doc.data().realAccountId;
  });

  if (!realAccountId) {
    console.log("No realAccountId found in settings.");
    return;
  }

  console.log(`Checking MT5 Account: ${realAccountId}`);
  const account = await metaApi.metatraderAccountApi.getAccount(realAccountId);
  const rpc = account.getRPCConnection();
  await rpc.connect();
  await rpc.waitSynchronized({ timeoutInSeconds: 15 }).catch(()=>console.log("Sync warning, proceeding"));

  // Fetch last 48 hours of orders/deals from MT5
  const startTime = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const endTime = new Date();
  
  const mt5Orders = await rpc.getHistoryOrdersByTimeRange(startTime, endTime);
  const mt5Deals = await rpc.getDealsByTimeRange(startTime, endTime);
  
  console.log("\n=============================================");
  console.log("          DIAGNOSTIC CROSS-REFERENCE         ");
  console.log("=============================================\n");

  for (const trade of dbTrades) {
    console.log(`[DB Trade] ID: ${trade.id} | Signal: ${trade.signal} | Entry: ${trade.entryPrice} | Time: ${trade.createdAt?.toDate ? trade.createdAt.toDate().toISOString() : trade.createdAt}`);
    
    // Attempt to find matching MT5 order
    // MT5 deals have a price, type, time. DB doesn't consistently store MT5 orderId (it was logged but maybe not in DB model).
    // Let's look for deals around the exact same time (within 5 minutes) and price/direction
    const tradeTime = trade.createdAt?.toDate ? trade.createdAt.toDate().getTime() : new Date(trade.createdAt).getTime();
    
    let matchedDeal = null;
    for (const deal of mt5Deals) {
      const dealTime = new Date(deal.time).getTime();
      const timeDiffMs = Math.abs(dealTime - tradeTime);
      
      const typeMatches = (trade.signal === 'LONG' && deal.type === 'DEAL_TYPE_BUY') || (trade.signal === 'SHORT' && deal.type === 'DEAL_TYPE_SELL');
      
      if (timeDiffMs < 5 * 60 * 1000 && typeMatches && deal.entry === 'DEAL_ENTRY_IN') {
        matchedDeal = deal;
        break;
      }
    }

    if (matchedDeal) {
      console.log(`   ✅ MATCH FOUND IN MT5: Deal #${matchedDeal.id}`);
      console.log(`      MT5 Fill Price: ${matchedDeal.price} | DB Expected: ${trade.entryPrice}`);
      const slippage = Math.abs(matchedDeal.price - trade.entryPrice).toFixed(2);
      console.log(`      Slippage: ${slippage} points`);
    } else {
      console.log(`   ❌ DISCREPANCY: No matching MT5 deal found for this trade!`);
      console.log(`      Reason: Trade was saved in DB but either broker rejected it, Auto-Trade was OFF at the time, or execution failed silently.`);
    }
    console.log("---------------------------------------------");
  }

  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
