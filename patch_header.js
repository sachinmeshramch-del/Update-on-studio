const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/components/layout/header.tsx';
let content = fs.readFileSync(file, 'utf8');

// Remove Finnhub (Backup) check
content = content.replace(/\s*: data\?\.source === "finnhub"\s*\? "Finnhub \(Backup\)"/, '');

// Remove Finnhub from hover popup
const finnhubBlock = `
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-foreground">Finnhub</span>
                  <span className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] uppercase font-bold",
                    connections?.finnhub === "connected" ? "bg-green-500/10 text-green-400" :
                    connections?.finnhub === "connecting" ? "bg-amber-500/10 text-amber-400" :
                    "bg-red-500/10 text-red-400"
                  )}>{connections?.finnhub || "disconnected"}</span>
                </div>`;
content = content.replace(finnhubBlock, '');

fs.writeFileSync(file, content);
console.log("Patched header.tsx");
