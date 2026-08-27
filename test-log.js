const http = require('http');
const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/analyze-market',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': 2
  }
}, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
});
req.write('{}');
req.end();
