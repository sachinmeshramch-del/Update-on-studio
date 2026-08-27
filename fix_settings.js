const fs = require('fs');
let content = fs.readFileSync('artifacts/gold-swing-ai/src/components/layout/settings-dialog.tsx', 'utf8');

// Update Interface
content = content.replace(
  /interface Settings \{[\s\S]*?autoTradingEnabled: boolean;\n\}/g,
  `interface Settings {
  tradingMode: "DEMO" | "REAL";
  demoAccountId: string;
  realAccountId: string;
  autoTradingDemoEnabled: boolean;
  autoTradingRealEnabled: boolean;
  autoTradingEnabled?: boolean;
  metaApiSymbol?: string;
}`
);

// Replace auto-trading switch block
const autoTradingOld = `<div className="flex flex-col gap-2 p-3 bg-muted/50 rounded-lg border">
              <div className="flex items-center justify-between">
                <Label className="font-bold cursor-pointer" htmlFor="auto-trading">Auto Trading</Label>
                <Switch
                  id="auto-trading"
                  checked={formData.autoTradingEnabled}
                  onCheckedChange={(c) => setFormData({ ...formData, autoTradingEnabled: c })}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                When enabled, the bot will automatically execute generated signals on your connected MetaApi account.
              </p>
            </div>`;

const autoTradingNew = `<div className="flex flex-col gap-2 p-3 bg-muted/50 rounded-lg border">
              <div className="flex items-center justify-between">
                <Label className="font-bold cursor-pointer" htmlFor="auto-trading-demo">Auto Trading (Demo)</Label>
                <Switch
                  id="auto-trading-demo"
                  checked={formData.autoTradingDemoEnabled ?? false}
                  onCheckedChange={(c) => setFormData({ ...formData, autoTradingDemoEnabled: c })}
                />
              </div>
              <div className="flex items-center justify-between mt-2">
                <Label className="font-bold cursor-pointer text-red-500" htmlFor="auto-trading-real">Auto Trading (Real)</Label>
                <Switch
                  id="auto-trading-real"
                  checked={formData.autoTradingRealEnabled ?? false}
                  onCheckedChange={(c) => setFormData({ ...formData, autoTradingRealEnabled: c })}
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                When enabled, the bot will automatically execute generated signals on the respective connected MetaApi account.
              </p>
            </div>`;

content = content.replace(autoTradingOld, autoTradingNew);

fs.writeFileSync('artifacts/gold-swing-ai/src/components/layout/settings-dialog.tsx', content);
