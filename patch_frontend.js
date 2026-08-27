const fs = require('fs');
let file = 'artifacts/gold-swing-ai/src/components/trading/live-tick-chart.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace('data.price.toLocaleString', 'data.price?.toLocaleString');
fs.writeFileSync(file, content);

let headerFile = 'artifacts/gold-swing-ai/src/components/layout/header.tsx';
let headerContent = fs.readFileSync(headerFile, 'utf8');
headerContent = headerContent.replace('data.change > 0 ?', '(data.change || 0) > 0 ?');
headerContent = headerContent.replace('formatNum(data.change)', 'formatNum(data.change || 0)');
headerContent = headerContent.replace('data.changePercent > 0 ?', '(data.changePercent || 0) > 0 ?');
headerContent = headerContent.replace('data.changePercent.toFixed', '(data.changePercent || 0).toFixed');
headerContent = headerContent.replace('formatNum(data.high24h)', 'formatNum(data.high24h || data.price || 0)');
headerContent = headerContent.replace('formatNum(data.low24h)', 'formatNum(data.low24h || data.price || 0)');
fs.writeFileSync(headerFile, headerContent);

console.log("Frontend patched!");
