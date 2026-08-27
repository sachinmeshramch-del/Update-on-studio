const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `    // Cache hit and less than 15 seconds old
    if (cached && (now - cached.timestamp < 15000)) {`;

const replacement = `    // Cache hit and less than 60 seconds old
    if (cached && (now - cached.timestamp < 60000)) {`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(file, content);
  console.log("PATCHED METAAPI CACHE");
} else {
  console.log("NOT FOUND CACHE TARGET");
}
