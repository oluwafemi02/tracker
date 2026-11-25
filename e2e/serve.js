// Serves the repo at http://localhost:8080/tracker/ (same path as GitHub Pages).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = process.cwd();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/tracker/')) { res.writeHead(404); return res.end(); }
  let p = normalize(decodeURIComponent(url.pathname.slice('/tracker/'.length))).replace(/^(\.\.[/\\])+/, '');
  if (!p || p === '.' || p.endsWith('/')) p = (p === '.' ? '' : p) + 'index.html';
  const file = join(root, p);
  try {
    if ((await stat(file)).isDirectory()) throw new Error('dir');
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(8080, () => console.log('http://localhost:8080/tracker/'));
