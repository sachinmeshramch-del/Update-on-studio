const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/components/layout/settings-dialog.tsx';
let code = fs.readFileSync(file, 'utf8');

// The first patch didn't work because of regex matching, let's do precise replacements

const targetSettingsInterface = `interface Settings {
  tradingMode: "DEMO" | "REAL";
  demoAccountId: string;
  realAccountId: string;
  autoTradingDemoEnabled: boolean;
  autoTradingRealEnabled: boolean;
  autoTradingEnabled?: boolean;`;

const replaceSettingsInterface = `interface Settings {
  tradingMode: "REAL";
  realAccountId: string;
  autoTradingRealEnabled: boolean;
  autoTradingEnabled?: boolean;`;

code = code.replace(targetSettingsInterface, replaceSettingsInterface);

const targetState = `  const [formData, setFormData] = useState<Settings>({
    tradingMode: "DEMO",
    demoAccountId: "",
    realAccountId: "",
    autoTradingDemoEnabled: false,
    autoTradingRealEnabled: false,
    autoTradingEnabled: false,`;

const replaceState = `  const [formData, setFormData] = useState<Settings>({
    tradingMode: "REAL",
    realAccountId: "",
    autoTradingRealEnabled: false,
    autoTradingEnabled: false,`;

code = code.replace(targetState, replaceState);

const targetEffect = `      setFormData({
        tradingMode: settings.tradingMode ?? "DEMO",
        demoAccountId: settings.demoAccountId ?? "",
        realAccountId: settings.realAccountId ?? "",
        autoTradingDemoEnabled: settings.autoTradingDemoEnabled ?? false,
        autoTradingRealEnabled: settings.autoTradingRealEnabled ?? false,
        autoTradingEnabled: settings.autoTradingEnabled ?? false,`;

const replaceEffect = `      setFormData({
        tradingMode: "REAL",
        realAccountId: settings.realAccountId ?? "",
        autoTradingRealEnabled: settings.autoTradingRealEnabled ?? false,
        autoTradingEnabled: settings.autoTradingEnabled ?? false,`;

code = code.replace(targetEffect, replaceEffect);

const targetHandleToggle = `  const handleToggle = (key: "autoTradingDemoEnabled" | "autoTradingRealEnabled", value: boolean) => {`;
const replaceHandleToggle = `  const handleToggle = (key: "autoTradingRealEnabled", value: boolean) => {`;
code = code.replace(targetHandleToggle, replaceHandleToggle);

const targetHandleMode = `  const handleModeChange = (mode: "DEMO" | "REAL") => {`;
const replaceHandleMode = `  const handleModeChange = (mode: "REAL") => {`;
code = code.replace(targetHandleMode, replaceHandleMode);


// UI
const uiDemoAutoTrading = `            <div className="flex flex-col gap-2 p-3 sm:p-3.5 bg-muted/40 rounded-xl border border-border/70">
              <div className="flex items-center justify-between">
                <Label className="font-semibold text-xs sm:text-sm cursor-pointer" htmlFor="auto-trading-demo">
                  Auto Trading (Demo)
                </Label>
                <Switch
                  id="auto-trading-demo"
                  checked={formData.autoTradingDemoEnabled ?? false}
                  onCheckedChange={(c) => handleToggle("autoTradingDemoEnabled", c)}
                />
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                <div className="flex flex-col">
                  <Label className="font-semibold text-xs sm:text-sm text-red-500 cursor-pointer" htmlFor="auto-trading-real">
                    Auto Trading (Real)
                  </Label>
                  <span className="text-[10px] text-red-500/80 font-medium">Live Execution Enabled</span>
                </div>
                <Switch
                  id="auto-trading-real"
                  checked={formData.autoTradingRealEnabled ?? false}
                  onCheckedChange={(c) => handleToggle("autoTradingRealEnabled", c)}
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                Switches save instantly to database and persist across page reloads.
              </p>
            </div>`;

const replaceUiDemoAutoTrading = `            <div className="flex flex-col gap-2 p-3 sm:p-3.5 bg-muted/40 rounded-xl border border-border/70">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <Label className="font-semibold text-xs sm:text-sm text-red-500 cursor-pointer" htmlFor="auto-trading-real">
                    Auto Trading (Real)
                  </Label>
                  <span className="text-[10px] text-red-500/80 font-medium">Live Execution Enabled</span>
                </div>
                <Switch
                  id="auto-trading-real"
                  checked={formData.autoTradingRealEnabled ?? false}
                  onCheckedChange={(c) => handleToggle("autoTradingRealEnabled", c)}
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                Switches save instantly to database and persist across page reloads.
              </p>
            </div>`;
code = code.replace(uiDemoAutoTrading, replaceUiDemoAutoTrading);

const uiTradingMode = `            {/* Trading Mode */}
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">Trading Mode</Label>
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
const replaceUiTradingMode = ``;
code = code.replace(uiTradingMode, replaceUiTradingMode);

const uiDemoAccountId = `              <div className="grid gap-1.5">
                <Label htmlFor="demo-id" className="text-xs font-semibold">MetaApi Demo Account ID</Label>
                <Input
                  id="demo-id"
                  value={formData.demoAccountId || ""}
                  onChange={(e) => setFormData({ ...formData, demoAccountId: e.target.value })}
                  placeholder="e.g. 5f7a...3d"
                  className="font-mono text-xs sm:text-sm h-9"
                />
              </div>`;
const replaceUiDemoAccountId = ``;
code = code.replace(uiDemoAccountId, replaceUiDemoAccountId);


fs.writeFileSync(file, code);
