const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/components/trading/chart-widget.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'src={buildChartUrl(interval)}',
  'src={buildChartUrl(interval, isDark)}'
);

if (!content.includes('const isDark = ')) {
  content = content.replace(
    '  const showBadge = !!candlePattern && !dismissed;',
    '  const showBadge = !!candlePattern && !dismissed;\n  const { theme } = useTheme();\n  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);'
  );
}

fs.writeFileSync(file, content);
console.log("Patched iframe");
