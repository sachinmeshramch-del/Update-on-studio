const fs = require('fs');
let file = 'artifacts/api-server/src/routes/trading.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/} catch \(err\) {\n    req\.log\.error\(\{ err \}, "Error generating signal"\);\n    res\.status\(500\)\.json\(\{ error: "signal_error", message: "Failed to generate trading signal" \}\);\n  }/, `} catch (err: any) {
    if (err.message && err.message.includes('MetaApi is not connected')) {
        res.status(503).json({ error: "signal_error", message: "MetaApi is not connected. Signals paused." });
    } else {
        req.log.error({ err }, "Error generating signal");
        res.status(500).json({ error: "signal_error", message: "Failed to generate trading signal" });
    }
  }`);

fs.writeFileSync(file, content);
