const fs = require('fs');
const file = 'lib/db/src/index.ts';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('setLogLevel')) {
  content = content.replace("import { getFirestore } from 'firebase/firestore';", "import { getFirestore, setLogLevel } from 'firebase/firestore';\nsetLogLevel('silent');");
  fs.writeFileSync(file, content);
  console.log("Patched lib/db/src/index.ts");
} else {
  console.log("Already patched");
}
