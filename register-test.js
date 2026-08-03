const http = require('http');
const data = JSON.stringify({ firstName: 'Test', lastName: 'User', email: 'testuser@example.com', phoneNumber: '+2348012345678', password: 'Password123', passwordConfirm: 'Password123' });
const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/auth/register',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  },
};
const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('STATUS', res.statusCode);
    console.log('BODY', body);
  });
});
req.on('error', (e) => {
  console.error('REQ_ERROR', e);
});
req.write(data);
req.end();
