const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/components/layout/settings-dialog.tsx';
let code = fs.readFileSync(file, 'utf8');

const targetSwitch = `            {/* Auto-Trading Controls */}
            <div className="flex flex-col gap-2 p-3 sm:p-3.5 bg-muted/40 rounded-xl border border-border/70">
              <div className="flex items-center justify-between">`;

const replaceSwitch = `            {/* Danger Controls */}
            <div className="flex flex-col gap-2 p-3 sm:p-3.5 bg-red-900/10 rounded-xl border border-red-500/30 mb-4">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <Label className="font-semibold text-xs sm:text-sm text-red-500 cursor-pointer" htmlFor="disable-cooldowns">
                    Disable All Cooldown Timers
                  </Label>
                  <span className="text-[10px] text-red-500/80 font-medium">(DANGEROUS) Bot trades non-stop without pausing for circuit breakers.</span>
                </div>
                <Switch
                  id="disable-cooldowns"
                  checked={formData.disableCooldowns ?? false}
                  onCheckedChange={(c) => handleToggle("disableCooldowns", c)}
                />
              </div>
            </div>
            
            {/* Auto-Trading Controls */}
            <div className="flex flex-col gap-2 p-3 sm:p-3.5 bg-muted/40 rounded-xl border border-border/70">
              <div className="flex items-center justify-between">`;

if (code.includes(targetSwitch) && !code.includes('Disable All Cooldown Timers')) {
    code = code.replace(targetSwitch, replaceSwitch);
    fs.writeFileSync(file, code);
}
