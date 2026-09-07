const { execSync } = require('child_process');
try {
  const out = execSync('npx tsx evaluate_live.ts', { stdio: 'pipe' }).toString();
  console.log(out);
} catch (e) {
  console.log(e.stdout.toString());
  console.log(e.stderr.toString());
}
