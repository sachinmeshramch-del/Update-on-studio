const { execSync } = require('child_process');
try {
  const result = execSync('grep -ri "trailing" /app/applet/artifacts/api-server/src/').toString();
  console.log(result);
} catch (e) {
  console.log("Error or no match:", e.message);
}
