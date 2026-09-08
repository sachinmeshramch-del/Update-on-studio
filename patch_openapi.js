const fs = require('fs');
let code = fs.readFileSync('lib/api-spec/openapi.yaml', 'utf8');

code = code.replace(
  'enum: [RUNNING, TARGET_HIT, STOP_HIT, HOLD]',
  'enum: [RUNNING, TARGET_HIT, STOP_HIT, HOLD, MANUALLY_CLOSED, CLOSED]'
);

fs.writeFileSync('lib/api-spec/openapi.yaml', code);
