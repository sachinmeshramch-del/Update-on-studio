const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `      const { getMetaApiStatus } = require("./metaApiFeed.js");
      if (getMetaApiStatus() !== "connected") {`;

const replacement = `      const { getMetaApiStatus, getLivePrice } = require("./metaApiFeed.js");
      if (getMetaApiStatus() !== "connected") {`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(file, content);
  console.log("PATCHED");
} else {
  console.log("NOT FOUND");
}
