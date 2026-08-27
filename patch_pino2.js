const fs = require('fs');
let file = 'artifacts/api-server/src/app.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'pinoHttp({',
  `pinoHttp({
    serializers: {
      err: (err) => {
        if (err && err.message && err.message.startsWith('failed with status code')) {
          return undefined; // Do not log the fake error created by pino-http
        }
        return pino.stdSerializers.err(err);
      },
    },`
);

// We need to import pino at the top
if (!content.includes('import pino from')) {
  content = content.replace('import pinoHttp from "pino-http";', 'import pinoHttp from "pino-http";\nimport pino from "pino";');
}

fs.writeFileSync(file, content);
console.log("Patched app.ts err serializer!");
