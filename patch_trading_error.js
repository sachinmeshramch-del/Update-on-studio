const fs = require('fs');
let file = 'artifacts/api-server/src/routes/trading.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/} catch \(err: any\) {\n    if \(err\.message && err\.message\.includes\('MetaApi is not connected'\)\) {\n        res\.status\(503\)\.json\(\{ error: "signal_error", message: "MetaApi is not connected. Signals paused." \}\);\n    } else {\n        req\.log\.error\(\{ err \}, "Error generating signal"\);\n        res\.status\(500\)\.json\(\{ error: "signal_error", message: "Failed to generate trading signal" \}\);\n    }\n  }/, `} catch (err: any) {
    if (err.message && (err.message.includes('MetaApi is not connected') || err.message.includes('status code 500'))) {
        res.status(503).json({ error: "signal_error", message: "MetaApi unavailable. Signals paused." });
    } else {
        req.log.warn({ err: err.message }, "Error generating signal");
        res.status(500).json({ error: "signal_error", message: "Failed to generate trading signal" });
    }
  }`);

fs.writeFileSync(file, content);
