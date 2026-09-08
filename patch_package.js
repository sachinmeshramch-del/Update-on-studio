const fs = require('fs');
let json = JSON.parse(fs.readFileSync('artifacts/api-server/package.json', 'utf8'));
json.scripts.start = json.scripts.start.replace('--env-file=', '--env-file-if-exists=');
fs.writeFileSync('artifacts/api-server/package.json', JSON.stringify(json, null, 2));
