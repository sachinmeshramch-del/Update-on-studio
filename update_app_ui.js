const fs = require('fs');

// 1. Update App.tsx
let appCode = fs.readFileSync('./artifacts/gold-swing-ai/src/App.tsx', 'utf8');
appCode = appCode.replace(
  'import Dashboard from "@/pages/dashboard";',
  'import Dashboard from "@/pages/dashboard";\nimport Backtest from "@/pages/backtest";'
);
appCode = appCode.replace(
  '<Route path="/" component={Dashboard} />',
  '<Route path="/" component={Dashboard} />\n      <Route path="/backtest" component={Backtest} />'
);
fs.writeFileSync('./artifacts/gold-swing-ai/src/App.tsx', appCode);

// 2. Update header.tsx to add navigation link
let headerCode = fs.readFileSync('./artifacts/gold-swing-ai/src/components/layout/header.tsx', 'utf8');
if (!headerCode.includes('href="/backtest"')) {
  headerCode = headerCode.replace(
    '</nav>',
    '  <Link href="/backtest" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"><History className="w-4 h-4" /> Backtest</Link>\n        </nav>'
  );
  // Ensure History icon is imported
  if (!headerCode.includes('History')) {
    headerCode = headerCode.replace(
      'Activity,',
      'Activity, History,'
    );
  }
  fs.writeFileSync('./artifacts/gold-swing-ai/src/components/layout/header.tsx', headerCode);
}
