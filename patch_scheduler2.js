const fs = require('fs');
let file = 'artifacts/api-server/src/lib/signalScheduler.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/if \(err instanceof Error && err\.message\.includes\('MetaApi is not connected'\)\) {\n      \/\/ Ignore gracefully\n    } else {\n      logger\.warn\(\{ err \}, "Signal scheduler tick failed"\);\n    }/, `if (err instanceof Error && (err.message.includes('MetaApi is not connected') || err.message.includes('status code 500'))) {
      // Ignore gracefully
    } else {
      logger.warn({ err: err instanceof Error ? err.message : err }, "Signal scheduler tick failed");
    }`);

fs.writeFileSync(file, content);
