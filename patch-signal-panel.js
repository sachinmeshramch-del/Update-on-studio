const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/components/trading/signal-panel.tsx';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  '<span>Updated {format(new Date(timestamp), "HH:mm:ss")}</span>',
  '<span>Updated {timestamp ? format(new Date(timestamp), "HH:mm:ss") : "N/A"}</span>'
);

fs.writeFileSync(file, code);
