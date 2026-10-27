import fs from "node:fs";
import { execSync, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Ensure backend dist/index.mjs exists
const backendDist = path.join(rootDir, "artifacts/api-server/dist/index.mjs");
if (!fs.existsSync(backendDist)) {
  console.log("[Dev Startup] Backend bundle not found, compiling api-server...");
  execSync("npm run build:backend", { cwd: rootDir, stdio: "inherit" });
}

// Ensure frontend assets exist
const frontendIndex = path.join(rootDir, "artifacts/gold-swing-ai/dist/public/index.html");
const serverPublicIndex = path.join(rootDir, "artifacts/api-server/dist/public/index.html");
if (!fs.existsSync(frontendIndex) && !fs.existsSync(serverPublicIndex)) {
  console.log("[Dev Startup] Frontend bundle not found, compiling frontend...");
  execSync("npm run build:frontend && node scripts/copy-assets.mjs", { cwd: rootDir, stdio: "inherit" });
}

console.log("[Dev Startup] Launching Gold Swing AI server on 0.0.0.0:3000...");
const child = spawn("node", ["--enable-source-maps", "./artifacts/api-server/dist/index.mjs"], {
  cwd: rootDir,
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: "3000",
    DEFAULT_APP_PORT: "3000",
  },
});

child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});

process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
