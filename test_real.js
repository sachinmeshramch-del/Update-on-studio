const { execSync } = require('child_process');
try {
  // query the api endpoint directly from localhost
  const out = execSync('curl -s http://localhost:3000/api/trading/signal').toString();
  console.log(JSON.parse(out).reason);
} catch (e) {
  console.error(e);
}
