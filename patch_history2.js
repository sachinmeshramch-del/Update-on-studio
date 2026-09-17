const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/components/trading/history-table.tsx';
let code = fs.readFileSync(file, 'utf8');

// Replace mobile view button
const targetMobile = `                        onClick={async () => {
                          if (!confirm("Are you sure you want to forcefully close this trade at market price?")) return;
                          try {
                            const res = await fetch(\`/api/signals/\${row.id}/close\`, { method: "POST" });
                            if (!res.ok) throw new Error("Failed to close");
                            toast.success("Trade manually closed successfully!");
                            onRefetch();
                          } catch (e) {
                            toast.error("Failed to close trade.");
                          }
                        }}`;

const replaceMobile = `                        onClick={() => setTradeToClose(row.id)}`;
code = code.replace(targetMobile, replaceMobile);

// Replace desktop view button
const targetDesktop = `                                onClick={async () => {
                                  if (!confirm("Are you sure you want to forcefully close this trade at the current market price?")) return;
                                  try {
                                    const res = await fetch(\`/api/signals/\${row.id}/close\`, { method: "POST" });
                                    if (!res.ok) throw new Error("Failed to close");
                                    toast.success("Trade manually closed successfully!");
                                    refetch();
                                  } catch (e) {
                                    toast.error("Failed to close trade.");
                                  }
                                }}`;
const replaceDesktop = `                                onClick={() => setTradeToClose(row.id)}`;
code = code.replace(targetDesktop, replaceDesktop);

fs.writeFileSync(file, code);
