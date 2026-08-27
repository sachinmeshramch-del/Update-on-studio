const http = require('http');
http.get('http://localhost:3000/api/price', (res) => {
  console.log('Status:', res.statusCode);
});
