import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const sourcePublic = path.resolve(rootDir, "artifacts/gold-swing-ai/dist/public");
const targets = [
  path.resolve(rootDir, "artifacts/api-server/dist/public"),
  path.resolve(rootDir, "dist/public"),
];

console.log("[Build] Syncing static frontend assets across candidate paths...");

if (!fs.existsSync(sourcePublic)) {
  console.error(`[Build ERROR] Source frontend build directory not found at: ${sourcePublic}`);
  process.exit(1);
}

const indexFile = path.join(sourcePublic, "index.html");
if (!fs.existsSync(indexFile)) {
  console.error(`[Build ERROR] index.html missing in: ${sourcePublic}`);
  process.exit(1);
}

for (const target of targets) {
  try {
    fs.mkdirSync(target, { recursive: true });
    fs.cpSync(sourcePublic, target, { recursive: true, force: true });
    console.log(`[Build] Successfully copied assets to: ${target}`);
  } catch (err) {
    console.warn(`[Build WARN] Failed copying to ${target}:`, err);
  }
}

console.log("[Build] Static asset distribution complete. Frontend is fully prepared for Google Cloud deployment.");
