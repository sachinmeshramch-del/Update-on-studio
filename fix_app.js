const fs = require('fs');
let content = fs.readFileSync('artifacts/api-server/src/app.ts', 'utf8');

const regex = /customSuccessMessage:\s*function\s*\([^)]*\)\s*\{[\s\S]*?return\s*'request completed';\s*\}/;

const replacement = `customSuccessMessage: function (req, res) {
      if (res.statusCode === 503) {
        return 'Market data unavailable (503)';
      }
      return 'request completed';
    },
    customErrorMessage: function (req, res, err) {
      if (res.statusCode === 503) {
        return 'Market data unavailable (503)';
      }
      return 'request errored';
    }`;

content = content.replace(regex, replacement);

fs.writeFileSync('artifacts/api-server/src/app.ts', content);
