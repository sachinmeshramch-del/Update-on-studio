const { execSync } = require('child_process');
try {
  const out = execSync('npx tsx test_eval2.ts', { stdio: 'pipe' }).toString();
  console.log(out);
} catch (e) {
  console.error(e.stdout.toString());
  console.error(e.stderr.toString());
}
