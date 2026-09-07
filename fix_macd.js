const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let content = fs.readFileSync(file, 'utf8');

// The interface property should be macdHistogram
content = content.replace(/macdHist: number;/g, 'macdHistogram: number;');
content = content.replace(/macdHist: 0/g, 'macdHistogram: 0');
content = content.replace(/macdHist: \+macdHist.toFixed\(4\)/g, 'macdHistogram: +macdHist.toFixed(4)');

fs.writeFileSync(file, content);
