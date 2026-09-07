const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/components/layout/settings-dialog.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetUI = `              <div className="flex items-center justify-between mt-2">
                <div className="flex flex-col">
                  <Label className="font-bold text-red-500/50" htmlFor="auto-trading-real">Auto Trading (Real)</Label>
                  <span className="text-[10px] text-red-500 font-medium">Strictly disabled for safety</span>
                </div>
                <Switch
                  id="auto-trading-real"
                  checked={false}
                  disabled={true}
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                Switches save instantly to database and stay strictly OFF across page reloads.
              </p>`;

const replaceUI = `              <div className="flex items-center justify-between mt-2">
                <div className="flex flex-col">
                  <Label className="font-bold text-red-500" htmlFor="auto-trading-real">Auto Trading (Real)</Label>
                  <span className="text-[10px] text-red-500 font-medium">Live Execution Enabled</span>
                </div>
                <Switch
                  id="auto-trading-real"
                  checked={formData.autoTradingRealEnabled ?? false}
                  onCheckedChange={(c) => handleToggle("autoTradingRealEnabled", c)}
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                Switches save instantly to database and persist across page reloads.
              </p>`;

content = content.replace(targetUI, replaceUI);
fs.writeFileSync(file, content);
