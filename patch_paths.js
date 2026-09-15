const fs = require('fs');
const file = 'artifacts/api-server/src/app.ts';
let code = fs.readFileSync(file, 'utf8');

if (!code.includes('path.resolve(process.cwd(), "public")')) {
  code = code.replace(
    'path.resolve(process.cwd(), "dist/public"),',
    'path.resolve(process.cwd(), "dist/public"),\n  path.resolve(process.cwd(), "public"),'
  );
  fs.writeFileSync(file, code);
}
