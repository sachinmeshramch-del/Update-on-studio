const fs = require('fs');
let file = 'artifacts/api-server/src/routes/trading.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(`
import { startMetaApiFeed } from "../lib/metaApiFeed.js";
router.get("/debug/meta", async (req, res) => {
  try {
    await startMetaApiFeed();
    res.json({status: "ok"});
  } catch(e) {
    res.json({error: e.message, stack: e.stack});
  }
});
`, '');

fs.writeFileSync(file, content);
console.log("Reverted!");
