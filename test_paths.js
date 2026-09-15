const path = require('path');
const fs = require('fs');

const __dirname_sim = path.resolve(process.cwd(), 'artifacts/api-server/dist');

const candidatePublicPaths = [
  path.join(__dirname_sim, "../../gold-swing-ai/dist/public"),
  path.join(__dirname_sim, "../../../artifacts/gold-swing-ai/dist/public"),
  path.resolve(process.cwd(), "artifacts/gold-swing-ai/dist/public"),
  path.resolve(process.cwd(), "gold-swing-ai/dist/public"),
  path.resolve(process.cwd(), "dist/public"),
  path.resolve(process.cwd(), "public"),
];

candidatePublicPaths.forEach(p => {
  console.log(`Path: ${p} - Exists: ${fs.existsSync(p)}`);
});
