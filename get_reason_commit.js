const { execSync } = require('child_process');
try {
  const out = execSync('npx tsx test_db.ts', { stdio: 'pipe' }).toString();
  console.log(out);
} catch (e) {
  console.log(e.stdout.toString());
}
