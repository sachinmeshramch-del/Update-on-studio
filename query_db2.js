const Database = require('better-sqlite3');
const db = new Database('.data/sqlite.db');
const rows = db.prepare('SELECT id, signal, trade_status, created_at, signal_type FROM signals ORDER BY id DESC LIMIT 5').all();
console.log(rows);
