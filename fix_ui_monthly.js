const fs = require('fs');
let code = fs.readFileSync('artifacts/gold-swing-ai/src/pages/backtest.tsx', 'utf8');

// Update states to default to fixed lot size for a better user experience
code = code.replace(
  'const [positionSizing, setPositionSizing] = useState("risk");',
  'const [positionSizing, setPositionSizing] = useState("fixed");'
);
code = code.replace(
  'const [fixedLotSize, setFixedLotSize] = useState("0.1");',
  'const [fixedLotSize, setFixedLotSize] = useState("0.10");'
);

// Update step="0.01" to step="any" and type to text where appropriate, or just keep number with step="any"
// Let's replace the Input for fixedLotSize
code = code.replace(
  /<Input[\s\S]*?value=\{fixedLotSize\}[\s\S]*?onChange=\{\(e\) => setFixedLotSize\(e\.target\.value\)\}[\s\S]*?max="100"[\s\S]*?\/>/,
  `<Input 
                    type="number" 
                    step="any"
                    value={fixedLotSize} 
                    onChange={(e) => setFixedLotSize(e.target.value)}
                    min="0.01"
                  />`
);

// Let's add a card for Projected Monthly PnL
// We need to adjust grid-cols from md:grid-cols-5 to md:grid-cols-6 (or adjust col-spans)
code = code.replace(
  '<div className="grid grid-cols-2 md:grid-cols-5 gap-4">',
  '<div className="grid grid-cols-2 md:grid-cols-6 gap-4">'
);

const newCard = `
                  <Card>
                    <CardContent className="p-4 flex flex-col justify-center items-center text-center h-full">
                      <span className="text-sm text-muted-foreground mb-1">Est. Monthly</span>
                      <span className={\`text-2xl font-bold \${results.projectedMonthlyPnl >= 0 ? "text-green-500" : "text-red-500"}\`}>
                        {results.projectedMonthlyPnl >= 0 ? "+" : ""}\${results.projectedMonthlyPnl.toFixed(2)}
                      </span>
                      <span className="text-xs text-muted-foreground mt-1">/ Month</span>
                    </CardContent>
                  </Card>`;

code = code.replace(
  '                  <Card className="col-span-2 md:col-span-2">',
  newCard + '\n                  <Card className="col-span-2 md:col-span-1">' // Adjusted the span so it all fits nicely
);

fs.writeFileSync('artifacts/gold-swing-ai/src/pages/backtest.tsx', code);
