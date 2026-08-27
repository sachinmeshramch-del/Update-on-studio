const http = require('http');
http.get('http://localhost:3001/api/trading/signal', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => console.log(data));
}).on('error', (err) => console.log(err.message));
