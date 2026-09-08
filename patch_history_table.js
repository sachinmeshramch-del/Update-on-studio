const fs = require('fs');
let code = fs.readFileSync('artifacts/gold-swing-ai/src/components/trading/history-table.tsx', 'utf8');

code = code.replace(
  'type TradeStatus  = "RUNNING" | "TARGET_HIT" | "STOP_HIT" | "HOLD";',
  'type TradeStatus  = "RUNNING" | "TARGET_HIT" | "STOP_HIT" | "HOLD" | "MANUALLY_CLOSED" | "CLOSED";'
);

code = code.replace(
  'if (status === "TARGET_HIT" || status === "STOP_HIT") {',
  'if (status === "TARGET_HIT" || status === "STOP_HIT" || status === "MANUALLY_CLOSED" || status === "CLOSED") {'
);

code = code.replace(
  'if (status === "STOP_HIT")\n    return (\n      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-destructive/15 text-destructive border border-destructive/30 whitespace-nowrap">\n        ❌ STOP LOSS\n      </span>\n    );',
  'if (status === "STOP_HIT")\n    return (\n      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-destructive/15 text-destructive border border-destructive/30 whitespace-nowrap">\n        ❌ STOP LOSS\n      </span>\n    );\n  if (status === "MANUALLY_CLOSED" || status === "CLOSED")\n    return (\n      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-500/15 text-slate-400 border border-slate-500/30 whitespace-nowrap">\n        🖐 MANUALLY CLOSED\n      </span>\n    );'
);

fs.writeFileSync('artifacts/gold-swing-ai/src/components/trading/history-table.tsx', code);
