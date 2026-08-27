const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/components/layout/header.tsx';
let content = fs.readFileSync(file, 'utf8');

const regex = /<div className="flex items-center gap-1\.5 mt-1 cursor-help">[\s\S]*?<Server className="w-3 h-3 ml-1 opacity-50" \/>\s*<\/span>\s*(?:<\/div>|<\/span>)/;
const regex2 = /<div className="flex items-center gap-1\.5 mt-1 cursor-help">[\s\S]*?<Server className="w-3 h-3 ml-1 opacity-50" \/>\s*<\/span>\s*<\/span>\s*<\/div>/;
const regex3 = /<div className="flex items-center gap-1\.5 mt-1 cursor-help">[\s\S]*?XAUUSD.*?<Server className="w-3 h-3 ml-1 opacity-50" \/>\s*<\/span>\s*<\/span>\s*<\/div>/;

const replacement = `              <div className="flex items-center gap-2 mt-1 cursor-help">
                <span className="text-[11px] font-mono tracking-widest text-muted-foreground uppercase">
                  XAUUSD
                </span>
                <div 
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border"
                  style={{
                    backgroundColor: !connected 
                      ? "rgba(239,68,68,0.1)" 
                      : data?.source === "metaapi" || data?.source === "twelvedata"
                        ? "rgba(34,197,94,0.1)"
                        : "rgba(234,179,8,0.1)",
                    borderColor: !connected 
                      ? "rgba(239,68,68,0.2)" 
                      : data?.source === "metaapi" || data?.source === "twelvedata"
                        ? "rgba(34,197,94,0.2)"
                        : "rgba(234,179,8,0.2)",
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full transition-colors duration-200"
                    style={{ backgroundColor: blinkOn && connected ? "#22c55e" : connected ? "#16a34a" : "#ef4444" }}
                  />
                  <span
                    className="text-[10px] font-mono font-bold uppercase tracking-wide flex items-center gap-1"
                    style={{
                      color: !connected
                        ? "#ef4444"
                        : data?.source === "metaapi" || data?.source === "twelvedata"
                          ? "#22c55e"
                          : data?.source === "finnhub"
                            ? "#eab308"
                            : "#6b7280",
                    }}
                  >
                    {!connected
                      ? (error ? "RECONNECTING" : "CONNECTING")
                      : data?.source === "metaapi"
                        ? "MetaApi Live"
                      : data?.source === "twelvedata"
                        ? "TwelveData Live"
                        : data?.source === "finnhub"
                          ? "Finnhub (Backup)"
                          : "LIVE"}
                  </span>
                </div>
              </div>`;

let found = false;
let newContent = content.replace(/<div className="flex items-center gap-1\.5 mt-1 cursor-help">[\s\S]*?<Server className="w-3 h-3 ml-1 opacity-50" \/>\s*<\/span>\s*<\/span>\s*<\/div>/, replacement);
if (newContent !== content) { found = true; content = newContent; }

if (!found) {
    // maybe it's just </span></div>
    newContent = content.replace(/<div className="flex items-center gap-1\.5 mt-1 cursor-help">[\s\S]*?<Server className="w-3 h-3 ml-1 opacity-50" \/>\s*<\/span>\s*<\/div>/, replacement);
    if (newContent !== content) { found = true; content = newContent; }
}

if (!found) {
    // Just find from <div className="flex items-center gap-1.5 mt-1 cursor-help"> up to the next {`hover popup`}
    newContent = content.replace(/<div className="flex items-center gap-1\.5 mt-1 cursor-help">[\s\S]*?(?=\{\/\*\s*Hover popup for connections\s*\*\/})/, replacement + "\n\n              ");
    if (newContent !== content) { found = true; content = newContent; }
}

if (found) {
    fs.writeFileSync(file, content);
    console.log("REPLACED SUCCESSFULLY");
} else {
    console.log("NO MATCH");
}
