const fs = require('fs');
let code = fs.readFileSync('./artifacts/gold-swing-ai/src/components/layout/header.tsx', 'utf8');

code = code.replace(
  '<div className="w-7 h-7 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0">\n              <Activity className="text-black w-4 h-4 sm:w-5 sm:h-5" />\n            </div>',
  '<Link href="/" className="w-7 h-7 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0 hover:opacity-80 transition-opacity">\n              <Activity className="text-black w-4 h-4 sm:w-5 sm:h-5" />\n            </Link>'
);

fs.writeFileSync('./artifacts/gold-swing-ai/src/components/layout/header.tsx', code);
