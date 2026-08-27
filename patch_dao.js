const fs = require('fs');
const file = 'lib/db/src/dao.ts';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('setDoc')) {
  content = content.replace("orderBy, limit, writeBatch } from 'firebase/firestore';", "orderBy, limit, writeBatch, setDoc } from 'firebase/firestore';");
}
// Also remove the extra import of SystemSettings if it clashes, but we just appended it.
fs.writeFileSync(file, content);
