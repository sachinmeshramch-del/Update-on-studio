const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/components/layout/header.tsx';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  '{new Date(data.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}',
  '{data?.timestamp ? new Date(data.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""}'
);

fs.writeFileSync(file, code);
