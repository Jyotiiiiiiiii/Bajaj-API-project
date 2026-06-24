/* Simple local test for /bfhl */
const http = require('http');

const payload = {
  data: [
    'A->B',
    'A->C',
    'B->D',
    'C->E',
    'E->F',
    'X->Y',
    'Y->Z',
    'Z->X',
    'P->Q',
    'Q->R',
    'G->H',
    'G->H',
    'G->I',
    'hello',
    '1->2',
    'A->'
  ]
};

const body = JSON.stringify(payload);

const req = http.request(
  {
    hostname: 'localhost',
    port: 3000,
    path: '/bfhl',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  },
  (res) => {
    let data = '';
    res.on('data', (chunk) => (data += chunk));
    res.on('end', () => {
      console.log('Status:', res.statusCode);
      console.log(JSON.stringify(JSON.parse(data), null, 2));
    });
  }
);

req.on('error', (e) => {
  console.error('Request failed:', e);
});

req.write(body);
req.end();

