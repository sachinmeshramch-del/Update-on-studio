const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/index.ts', 'utf8');

code = code.replace(
  'const isAIStudioPreview = !!process.env.APPLET_ID;\nconst port = isAIStudioPreview ? 3000 : parseInt(process.env.PORT || "8080", 10);',
  'const isAIStudioPreview = !!process.env.CONTROL_PLANE_PORT || !!process.env.DEFAULT_APP_PORT;\nconst port = isAIStudioPreview ? 3000 : parseInt(process.env.PORT || "8080", 10);'
);

fs.writeFileSync('artifacts/api-server/src/index.ts', code);
