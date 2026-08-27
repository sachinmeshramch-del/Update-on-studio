const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/components/trading/chart-widget.tsx';
let content = fs.readFileSync(file, 'utf8');

// The buildChartUrl is defined outside the component, let's pass isDark to it
content = content.replace(
  'function buildChartUrl(interval: string): string {',
  'function buildChartUrl(interval: string, isDark: boolean): string {'
);

content = content.replace(
  'theme:             "dark",',
  'theme:             isDark ? "dark" : "light",'
);

content = content.replace(
  'toolbar_bg:        "131722",',
  'toolbar_bg:        isDark ? "131722" : "ffffff",'
);

content = content.replace(
  'backgroundColor:   "rgba(19,23,34,1)",',
  'backgroundColor:   isDark ? "rgba(19,23,34,1)" : "rgba(255,255,255,1)",'
);

content = content.replace(
  'gridColor:         "rgba(255,255,255,0.04)",',
  'gridColor:         isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",'
);

content = content.replace(
  'const url = buildChartUrl(timeframe);',
  'const { theme } = useTheme();\n  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);\n  const url = buildChartUrl(timeframe, isDark);'
);

content = content.replace(
  'const { theme } = useTheme();\n  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);\n  const chartRef = useRef<IChartApi | null>(null);',
  '' // Clean up accidentally patched code from before
);

fs.writeFileSync(file, content);
console.log("Patched chart-widget");
