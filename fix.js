const fs = require('fs');
const file = 'artifacts/api-server/src/routes/trading.ts';
let code = fs.readFileSync(file, 'utf8');

const lastGood = `
  } catch (err: any) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});`;

const parts = code.split(lastGood);
fs.writeFileSync(file, parts[0] + lastGood + '\n\nexport default router;');
