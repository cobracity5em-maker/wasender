import http from 'http';
const PORT = 3000;
const server = http.createServer((req, res) => {
  console.log('HIT', req.method, req.url);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<h1>TEST OK</h1><p>Port 3000 accepts connections.</p>');
});
server.on('error', (e) => {
  console.error('ERROR', e.message);
  if (e.code === 'EADDRINUSE') console.error('Port 3000 busy');
});
server.listen(PORT, '127.0.0.1', () => {
  console.log('TEST listening on http://127.0.0.1:' + PORT);
  console.log('Open that URL in browser. This window must show HIT');
});
