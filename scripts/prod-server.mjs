import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const MIME_MAP = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.tflite': 'application/octet-stream',
  '.gz': 'application/gzip',
  '.csv': 'text/csv; charset=utf-8',
};

/**
 * Creates a standalone production static server that serves the built dist
 * simultaneously at root (/) and at a nested subpath (/solcheck/).
 * Completely independent of Vite or dev server plugins.
 */
export function startProductionServer({ distDir, port = 4174, nestedPrefix = '/solcheck' }) {
  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
      let pathname = decodeURIComponent(url.pathname);

      // Handle redirect for nested prefix without trailing slash
      if (nestedPrefix && pathname === nestedPrefix) {
        res.writeHead(301, { Location: nestedPrefix + '/' + (url.search || '') + (url.hash || '') });
        return res.end();
      }

      // If URL begins with nested prefix, strip it to map to distDir
      if (nestedPrefix && pathname.startsWith(nestedPrefix + '/')) {
        pathname = pathname.slice(nestedPrefix.length);
      }

      // Map request pathname to local file in distDir
      const relativePath = pathname.startsWith('/') ? pathname.slice(1) : pathname;
      let filePath = join(distDir, relativePath);

      if (existsSync(filePath) && statSync(filePath).isDirectory()) {
        filePath = join(filePath, 'index.html');
      }

      // SPA fallback for HTML navigation requests
      if (!existsSync(filePath)) {
        filePath = join(distDir, 'index.html');
      }

      if (!existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Not Found');
      }

      // Resolve MIME type
      let mime = 'application/octet-stream';
      if (pathname.includes('+esm')) {
        mime = 'text/javascript; charset=utf-8';
      } else {
        const ext = extname(filePath).toLowerCase();
        mime = MIME_MAP[ext] || 'application/octet-stream';
      }

      const stat = statSync(filePath);
      res.writeHead(200, {
        'Content-Type': mime,
        'Content-Length': stat.size,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
      });
      createReadStream(filePath).pipe(res);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(String(err));
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => {
      resolve(server);
    });
    server.on('error', reject);
  });
}
