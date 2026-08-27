const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/components/trading/live-tick-chart.tsx';
let content = fs.readFileSync(file, 'utf8');

const effect = `
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.applyOptions({
        layout: { textColor: isDark ? "#9ca3af" : "#4b5563" },
        grid: {
          vertLines: { color: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" },
          horzLines: { color: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" },
        },
        rightPriceScale: {
          borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
        },
        timeScale: {
          borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
        }
      });
    }
  }, [isDark]);

  useEffect(() => {
`;

content = content.replace('  useEffect(() => {', effect);

fs.writeFileSync(file, content);
console.log("Patched livetick theme applyOptions");
