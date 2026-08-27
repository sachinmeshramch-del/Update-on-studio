const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/components/trading/live-tick-chart.tsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('const isDark =')) {
  content = content.replace(
    '  const containerRef  = useRef<HTMLDivElement>(null);',
    '  const { theme } = useTheme();\n  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);\n  const containerRef  = useRef<HTMLDivElement>(null);'
  );
}

fs.writeFileSync(file, content);
console.log("Patched livetick");
