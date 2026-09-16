const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/components/layout/settings-dialog.tsx';
let code = fs.readFileSync(file, 'utf8');

if (!code.includes('disableCooldowns?: boolean;')) {
    code = code.replace(
        'dailyStopLossPercent?: number;',
        'dailyStopLossPercent?: number;\n  disableCooldowns?: boolean;'
    );
}

const targetSwitch = `<div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base text-foreground font-semibold">Enable Real-Money Auto-Trading</Label>`;

const replaceSwitch = `<div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base text-foreground font-semibold">Disable All Cooldown Timers</Label>
                <p className="text-xs text-muted-foreground">
                  (DANGEROUS) Bypasses the circuit breaker and post-trade cooldowns so the bot trades non-stop.
                </p>
              </div>
              <Switch
                checked={settings?.disableCooldowns || false}
                onCheckedChange={(checked) => mutation.mutate({ disableCooldowns: checked })}
                disabled={mutation.isPending}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base text-foreground font-semibold">Enable Real-Money Auto-Trading</Label>`;

if (code.includes(targetSwitch) && !code.includes('Disable All Cooldown Timers')) {
    code = code.replace(targetSwitch, replaceSwitch);
    fs.writeFileSync(file, code);
}
