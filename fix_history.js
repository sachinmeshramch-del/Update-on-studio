const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/components/trading/history-table.tsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('import { toast }')) {
  content = content.replace(
    'import { format } from "date-fns";',
    'import { format } from "date-fns";\nimport { toast } from "sonner";'
  );
  fs.writeFileSync(file, content);
  console.log("Added toast import to history-table.tsx");
}
