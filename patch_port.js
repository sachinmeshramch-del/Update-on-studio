const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/index.ts', 'utf8');

code = code.replace(
  'const port = 3000; // MUST BE 3000 per infrastructure constraints',
  'const isAIStudioPreview = !!process.env.APPLET_ID;\nconst port = isAIStudioPreview ? 3000 : parseInt(process.env.PORT || "8080", 10);'
);

fs.writeFileSync('artifacts/api-server/src/index.ts', code);
