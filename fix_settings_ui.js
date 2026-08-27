const fs = require('fs');
let content = fs.readFileSync('artifacts/gold-swing-ai/src/components/layout/settings-dialog.tsx', 'utf8');

// Update Interface
content = content.replace(
  /autoTradingRealEnabled: boolean;/g,
  `autoTradingRealEnabled: boolean;
  metaApiSymbol?: string;`
);

// Add the symbol input field before the Save button
const oldInput = `<Button onClick={handleSave} disabled={mutation.isPending}>`;
const newInput = `<div className="grid gap-2">
              <Label htmlFor="meta-symbol">MetaApi Symbol</Label>
              <Input
                id="meta-symbol"
                value={formData.metaApiSymbol || ""}
                onChange={(e) => setFormData({ ...formData, metaApiSymbol: e.target.value })}
                placeholder="e.g. XAUUSD or XAUUSD.a"
                className="font-mono text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Leave blank to use default XAUUSD. Some brokers use suffixes like XAUUSD.a or XAUUSDm.
              </p>
            </div>
            <Button onClick={handleSave} disabled={mutation.isPending}>`;

content = content.replace(oldInput, newInput);

fs.writeFileSync('artifacts/gold-swing-ai/src/components/layout/settings-dialog.tsx', content);
