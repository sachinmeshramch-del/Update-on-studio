const fs = require('fs');
const file = 'lib/db/src/dao.ts';
let code = fs.readFileSync(file, 'utf8');

const oldQ = `const q = query(collection(db, 'signals'), where('tradeStatus', 'in', ['TARGET_HIT', 'STOP_HIT']), orderBy('createdAt', 'desc'), limit(limitCount));`;
const newQ = `const q = query(collection(db, 'signals'), where('tradeStatus', 'in', ['TARGET_HIT', 'STOP_HIT', 'MANUALLY_CLOSED', 'CLOSED']), orderBy('createdAt', 'desc'), limit(limitCount));`;

code = code.replace(oldQ, newQ);

fs.writeFileSync(file, code);
