import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'};
const server = http.createServer(async (req, res) => {
  try {
    const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || relative.split(/[\\/]/).some(p => p.startsWith('.')) || !['.html','.css','.js','.json','.svg','.webp','.png','.woff2'].includes(path.extname(file))) {res.writeHead(403).end('Forbidden');return;}
    const data = await fs.readFile(file);
    res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-cache'}).end(data);
  } catch {res.writeHead(404).end('Not found');}
});
server.listen(4173, '127.0.0.1', () => console.log('Основы права: http://127.0.0.1:4173'));
server.on('error', error => {console.error(error.message);process.exit(1)});
