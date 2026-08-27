const fs = require('fs');
const file = 'artifacts/api-server/src/app.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'res.status(503).send("Frontend is building, please wait a few seconds and refresh...");',
  'res.status(200).send("<html><head><meta http-equiv=\'refresh\' content=\'2\'></head><body><p>Frontend is building, please wait a few seconds...</p></body></html>");'
);

fs.writeFileSync(file, content);
console.log("Patched 503 to 200");
