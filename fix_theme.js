const fs = require('fs');
let code = fs.readFileSync('artifacts/gold-swing-ai/src/components/theme-provider.tsx', 'utf8');

code = code.replace(
  'defaultTheme = "system",',
  'defaultTheme = "dark",'
);

code = code.replace(
  'theme: "system",',
  'theme: "dark",'
);

fs.writeFileSync('artifacts/gold-swing-ai/src/components/theme-provider.tsx', code);
