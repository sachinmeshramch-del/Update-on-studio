const fs = require('fs');
const file = 'lib/db/src/schema/settings.ts';
let content = fs.readFileSync(file, 'utf8');
if (!content.includes('demoAccountId')) {
  content = content.replace('  realAccountId: string;', '  demoAccountId?: string;\n  realAccountId: string;');
  fs.writeFileSync(file, content);
}
