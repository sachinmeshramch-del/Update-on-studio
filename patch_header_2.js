const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/components/layout/header.tsx';
let code = fs.readFileSync(file, 'utf8');

const target1 = `    tradingMode: "DEMO" | "REAL";`;
const replace1 = `    tradingMode?: "REAL";`;
code = code.replace(target1, replace1);

const target2 = `              <button
                onClick={() => {
                  if (toggleMutation.isPending) return;
                  const nextMode = settings?.tradingMode === "REAL" ? "DEMO" : "REAL";
                  toggleMutation.mutate({ tradingMode: nextMode });
                }}
                disabled={toggleMutation.isPending}
                className={\`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wider uppercase transition-all shadow-sm border \${
                  settings?.tradingMode === "REAL"
                    ? "bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20"
                    : "bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/20"
                }\`}
              >
                {settings?.tradingMode || "DEMO"}
              </button>`;
const replace2 = `              <div
                className={\`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wider uppercase transition-all shadow-sm border bg-red-500/10 text-red-500 border-red-500/20\`}
              >
                REAL
              </div>`;
code = code.replace(target2, replace2);

fs.writeFileSync(file, code);
