const fs = require('fs');
let file = 'artifacts/api-server/src/app.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'pinoHttp({',
  `pinoHttp({
    customLogLevel: function (req, res, err) {
      if (res.statusCode >= 500) {
        return 'warn'; // Prevents 'request errored' with stack trace
      }
      if (res.statusCode >= 400) {
        return 'warn';
      }
      return 'info';
    },
    customSuccessMessage: function (req, res) {
      if (res.statusCode === 503) {
        return 'Market data unavailable (503)';
      }
      return 'request completed';
    },
    customErrorMessage: function (req, res, err) {
      return 'request failed: ' + res.statusCode;
    },`
);

fs.writeFileSync(file, content);
console.log("Patched app.ts!");
