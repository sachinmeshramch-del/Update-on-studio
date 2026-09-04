const fs = require('fs');
let code = fs.readFileSync('./artifacts/gold-swing-ai/src/components/layout/header.tsx', 'utf8');

code = code.replace(
  '<div className="flex items-center gap-3 shrink-0">',
  '<Link href="/" className="flex items-center gap-3 shrink-0 cursor-pointer hover:opacity-80 transition-opacity">'
);

code = code.replace(
  '</div>\n          {/* ── Bid / Ask block',
  '</Link>\n          {/* ── Bid / Ask block'
);

fs.writeFileSync('./artifacts/gold-swing-ai/src/components/layout/header.tsx', code);
