const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/pages/dashboard.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'h-[500px] lg:h-auto min-h-[500px]',
  'h-[350px] sm:h-[500px] lg:h-auto min-h-[350px] sm:min-h-[500px]'
);

content = content.replace(
  'px-4 py-6 md:py-8',
  'px-2 sm:px-4 py-4 md:py-8'
);

fs.writeFileSync(file, content);
console.log("Patched dashboard.tsx");
