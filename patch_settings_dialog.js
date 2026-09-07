const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/components/layout/settings-dialog.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetType = `  metaApiSymbol?: string;
}`;
const replaceType = `  metaApiSymbol?: string;
  riskPerTradePercent?: number;
  dailyProfitTargetPercent?: number;
  dailyStopLossPercent?: number;
}`;
content = content.replace(targetType, replaceType);

const targetForm = `    metaApiSymbol: "XAUUSD"
  });`;
const replaceForm = `    metaApiSymbol: "XAUUSD",
    riskPerTradePercent: 1.0,
    dailyProfitTargetPercent: 3.0,
    dailyStopLossPercent: 5.0
  });`;
content = content.replace(targetForm, replaceForm);

const targetUI = `            <div className="grid gap-2">
              <Label htmlFor="meta-symbol">MetaApi Symbol</Label>`;
const replaceUI = `            <div className="grid grid-cols-3 gap-4 border-y border-border py-4 my-2">
              <div className="grid gap-2">
                <Label htmlFor="risk-trade" className="text-xs">Risk / Trade (%)</Label>
                <Input
                  id="risk-trade"
                  type="number" step="0.1"
                  value={formData.riskPerTradePercent || 1.0}
                  onChange={(e) => setFormData({ ...formData, riskPerTradePercent: parseFloat(e.target.value) })}
                  className="font-mono text-xs h-8"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="profit-target" className="text-xs text-green-500">Daily Target (%)</Label>
                <Input
                  id="profit-target"
                  type="number" step="0.1"
                  value={formData.dailyProfitTargetPercent || 3.0}
                  onChange={(e) => setFormData({ ...formData, dailyProfitTargetPercent: parseFloat(e.target.value) })}
                  className="font-mono text-xs h-8"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="stop-target" className="text-xs text-red-500">Daily Stop (%)</Label>
                <Input
                  id="stop-target"
                  type="number" step="0.1"
                  value={formData.dailyStopLossPercent || 5.0}
                  onChange={(e) => setFormData({ ...formData, dailyStopLossPercent: parseFloat(e.target.value) })}
                  className="font-mono text-xs h-8"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="meta-symbol">MetaApi Symbol</Label>`;
content = content.replace(targetUI, replaceUI);

fs.writeFileSync(file, content);
console.log("Patched settings-dialog.tsx");
