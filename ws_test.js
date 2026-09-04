const WebSocket = require('./node_modules/ws');
const ws = new WebSocket('ws://localhost:3000/api/price/ws');
ws.on('message', function incoming(data) {
  const msg = JSON.parse(data);
  if (msg.type === 'history') {
    console.log('History length:', msg.ticks.length, 'Last tick:', msg.ticks[msg.ticks.length-1]);
    process.exit(0);
  } else {
    console.log('Tick:', msg);
    process.exit(0);
  }
});
ws.on('error', console.error);
