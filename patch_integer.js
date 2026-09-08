const fs = require('fs');
let code = fs.readFileSync('lib/api-spec/openapi.yaml', 'utf8');

code = code.replace(
  'type: integer',
  'type: number'
);

fs.writeFileSync('lib/api-spec/openapi.yaml', code);
