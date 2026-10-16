import { createClient } from "@libsql/client";
const client = createClient({ url: "file:../../.data/sqlite.db" });
const res = await client.execute("SELECT id, signal, tradeStatus, createdAt FROM signals ORDER BY createdAt DESC LIMIT 20;");
res.rows.forEach(r => console.log(`${r.id} | ${r.signal} | ${r.tradeStatus} | ${r.createdAt}`));
