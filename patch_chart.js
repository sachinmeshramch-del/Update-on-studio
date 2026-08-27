const fs = require('fs');

function patchChart(file) {
  let content = fs.readFileSync(file, 'utf8');

  // Add useTheme import if missing
  if (!content.includes('import { useTheme }')) {
    content = content.replace(
      'import { cn } from "@/lib/utils";',
      'import { cn } from "@/lib/utils";\nimport { useTheme } from "@/components/theme-provider";'
    );
  }

  // Inside the component, get theme (assuming 'export function LiveTickChart' or 'export function ChartWidget')
  content = content.replace(
    '  const [resolution, setResolution] = useState<number>(30);',
    '  const { theme } = useTheme();\n  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);\n  const [resolution, setResolution] = useState<number>(30);'
  );

  content = content.replace(
    '  const chartRef = useRef<IChartApi | null>(null);',
    '  const { theme } = useTheme();\n  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);\n  const chartRef = useRef<IChartApi | null>(null);'
  );

  // Update layout colors
  content = content.replace(/textColor: "#9ca3af",/g, 'textColor: isDark ? "#9ca3af" : "#4b5563",');
  content = content.replace(/vertLines: \{ color: "rgba\(255,255,255,0\.04\)" \},/g, 'vertLines: { color: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" },');
  content = content.replace(/horzLines: \{ color: "rgba\(255,255,255,0\.04\)" \},/g, 'horzLines: { color: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" },');
  content = content.replace(/borderColor: "rgba\(255,255,255,0\.08\)",/g, 'borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",');
  content = content.replace(/borderColor: "rgba\(255, 255, 255, 0\.08\)",/g, 'borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",');
  content = content.replace(/color: "rgba\(255, 255, 255, 0\.06\)"/g, 'color: isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)"');

  // Need to update the chart when the theme changes (we will use chart.applyOptions)
  const effectHooks = `
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
`;
  content = content.replace('  // ── Auto-resize ─────────────────────────────────────────────────────────', effectHooks + '\n  // ── Auto-resize ─────────────────────────────────────────────────────────');

  fs.writeFileSync(file, content);
}

patchChart('artifacts/gold-swing-ai/src/components/trading/live-tick-chart.tsx');
patchChart('artifacts/gold-swing-ai/src/components/trading/chart-widget.tsx');

console.log("Patched charts for themes");
