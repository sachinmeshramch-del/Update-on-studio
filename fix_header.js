const fs = require('fs');
let code = fs.readFileSync('./artifacts/gold-swing-ai/src/components/layout/header.tsx', 'utf8');

if (!code.includes('import { Link }')) {
  code = code.replace(
    'import { Activity',
    'import { Link } from "wouter";\nimport { Activity'
  );
}

if (!code.includes('href="/backtest"')) {
  code = code.replace(
    '<SettingsDialog />',
    '<Link href="/backtest" className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-black/5 dark:bg-white/5 text-muted-foreground hover:border-amber-500/30 hover:text-amber-600 dark:hover:text-amber-400 transition-all shrink-0">\n              <History className="w-3.5 h-3.5" />\n              <span className="hidden sm:inline">Backtest</span>\n              <span className="sm:hidden">Test</span>\n            </Link>\n            <SettingsDialog />'
  );
}

fs.writeFileSync('./artifacts/gold-swing-ai/src/components/layout/header.tsx', code);
