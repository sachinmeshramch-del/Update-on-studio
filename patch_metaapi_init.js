const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `export async function startMetaApiFeed() {
    if (!token || !accountId) {
        logger.error("META_API_TOKEN and META_ACCOUNT_ID must be set in the environment.");
        throw new Error("Missing MetaApi credentials");
    }

    metaApiStatus = "connecting";`;

const replacement = `export async function startMetaApiFeed() {
    if (!token || !accountId) {
        logger.error("META_API_TOKEN and META_ACCOUNT_ID must be set in the environment.");
        throw new Error("Missing MetaApi credentials");
    }
    
    if (metaApiStatus === "connecting") return; // Prevent double-initialization
    
    metaApiStatus = "connecting";`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(file, content);
  console.log("PATCHED DOUBLE INIT");
} else {
  console.log("NOT FOUND INIT BLOCK");
}
