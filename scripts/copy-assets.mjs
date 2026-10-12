import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const candidateSources = [
  path.resolve(rootDir, "artifacts/gold-swing-ai/dist/public"),
  path.resolve(rootDir, "dist/public"),
  path.resolve(rootDir, "artifacts/gold-swing-ai/dist"),
];

const targets = [
  path.resolve(rootDir, "artifacts/api-server/dist/public"),
  path.resolve(rootDir, "dist/public"),
  path.resolve(rootDir, "artifacts/gold-swing-ai/dist/public"),
];

console.log("[Build] Syncing static frontend assets across candidate paths...");

async function findReadySource(maxWaitMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    for (const src of candidateSources) {
      const idx = path.join(src, "index.html");
      if (fs.existsSync(idx) && fs.statSync(idx).size > 100) {
        return src;
      }
    }
    // Wait 500ms before checking again in case Vite is still writing files
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return "";
}

const readySource = await findReadySource(20000);

if (!readySource) {
  console.error(
    `[Build ERROR] index.html not found in any source directories after wait: ${candidateSources.join(", ")}`
  );
  process.exit(1);
}

console.log(`[Build] Using source public assets from: ${readySource}`);

for (const target of targets) {
  if (target === readySource) continue;
  try {
    fs.mkdirSync(target, { recursive: true });
    fs.cpSync(readySource, target, { recursive: true, force: true });
    console.log(`[Build] Successfully copied assets to: ${target}`);
  } catch (err) {
    console.warn(`[Build WARN] Failed copying to ${target}:`, err);
  }
}

console.log("[Build] Static asset distribution complete. Frontend is fully prepared for Google Cloud deployment.");
