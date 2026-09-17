const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/pages/settings.tsx';
let code = fs.readFileSync(file, 'utf8');

const targetEffect = `        tradingMode: settings.tradingMode || "DEMO",`;
const replaceEffect = `        tradingMode: "REAL",`;
code = code.replace(targetEffect, replaceEffect);

const targetModeToggleUI = `            <div className="grid gap-1.5 mt-5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">Trading Mode</Label>
              <div className="flex bg-muted p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => handleModeChange("DEMO")}
                  className={\`flex-1 text-xs font-semibold py-2 rounded-md transition-all \${
                    formData.tradingMode === "DEMO"
                      ? "bg-background shadow-xs text-green-600 dark:text-green-400"
                      : "text-muted-foreground hover:text-foreground"
                  }\`}
                >
                  DEMO ACCOUNT
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange("REAL")}
                  className={\`flex-1 text-xs font-semibold py-2 rounded-md transition-all \${
                    formData.tradingMode === "REAL"
                      ? "bg-background shadow-xs text-red-600 dark:text-red-400"
                      : "text-muted-foreground hover:text-foreground"
                  }\`}
                >
                  REAL ACCOUNT
                </button>
              </div>
            </div>`;

code = code.replace(targetModeToggleUI, '');

fs.writeFileSync(file, code);
