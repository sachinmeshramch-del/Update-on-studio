const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/pages/settings.tsx';
let code = fs.readFileSync(file, 'utf8');

const targetInterface = `interface Settings {
  tradingMode: "DEMO" | "REAL";
  demoAccountId: string;
  realAccountId: string;
  autoTradingDemoEnabled: boolean;
  autoTradingRealEnabled: boolean;`;

const replaceInterface = `interface Settings {
  tradingMode: "REAL";
  realAccountId: string;
  autoTradingRealEnabled: boolean;`;
code = code.replace(targetInterface, replaceInterface);

const targetState = `  const [formData, setFormData] = useState<Settings>({
    tradingMode: "DEMO",
    demoAccountId: "",
    realAccountId: "",
    autoTradingDemoEnabled: false,
    autoTradingRealEnabled: false,`;
const replaceState = `  const [formData, setFormData] = useState<Settings>({
    tradingMode: "REAL",
    realAccountId: "",
    autoTradingRealEnabled: false,`;
code = code.replace(targetState, replaceState);

const targetEffect = `      setFormData({
        tradingMode: settings.tradingMode || "DEMO",
        demoAccountId: settings.demoAccountId || "",
        realAccountId: settings.realAccountId || "",
        autoTradingDemoEnabled: settings.autoTradingDemoEnabled || false,
        autoTradingRealEnabled: settings.autoTradingRealEnabled || false,`;
const replaceEffect = `      setFormData({
        tradingMode: "REAL",
        realAccountId: settings.realAccountId || "",
        autoTradingRealEnabled: settings.autoTradingRealEnabled || false,`;
code = code.replace(targetEffect, replaceEffect);

const targetToggle = `  const handleToggle = (key: "autoTradingDemoEnabled" | "autoTradingRealEnabled", value: boolean) => {`;
const replaceToggle = `  const handleToggle = (key: "autoTradingRealEnabled", value: boolean) => {`;
code = code.replace(targetToggle, replaceToggle);

const targetMode = `  const handleModeChange = (mode: "DEMO" | "REAL") => {`;
const replaceMode = `  const handleModeChange = (mode: "REAL") => {`;
code = code.replace(targetMode, replaceMode);

const uiDemoTrading = `              <div className="flex items-center justify-between">
                <Label className="font-semibold text-xs sm:text-sm cursor-pointer" htmlFor="auto-trading-demo">
                  Auto Trading (Demo)
                </Label>
                <Switch
                  id="auto-trading-demo"
                  checked={formData.autoTradingDemoEnabled}
                  onCheckedChange={(c) => handleToggle("autoTradingDemoEnabled", c)}
                />
              </div>
              <div className="flex items-center justify-between pt-3 mt-3 border-t border-border/50">`;
const replaceUiDemoTrading = `              <div className="flex items-center justify-between">`;
code = code.replace(uiDemoTrading, replaceUiDemoTrading);

const uiDemoMode = `            <div className="grid gap-1.5 mt-5">
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
const replaceUiDemoMode = ``;
code = code.replace(uiDemoMode, replaceUiDemoMode);

const uiDemoInput = `            <div className="grid gap-4 mt-5">
              <div className="grid gap-2">
                <Label htmlFor="demo-id" className="text-sm font-semibold">MetaApi Demo Account ID</Label>
                <Input
                  id="demo-id"
                  value={formData.demoAccountId || ""}
                  onChange={(e) => setFormData({ ...formData, demoAccountId: e.target.value })}
                  placeholder="e.g. 5f7a...3d"
                  className="font-mono h-11"
                />
              </div>`;
const replaceUiDemoInput = `            <div className="grid gap-4 mt-5">`;
code = code.replace(uiDemoInput, replaceUiDemoInput);

fs.writeFileSync(file, code);
