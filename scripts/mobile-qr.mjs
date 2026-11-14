import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';

function getLocalIp() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

const localIp = getLocalIp();
const port = 4173;
const targetUrl = `http://${localIp}:${port}/`;

console.log('\n================================================================');
console.log('       SOL CHECK MOBILE PREVIEW (IPHONE 15 & ANDROID)           ');
console.log('================================================================');
console.log(`\n  Target URL: \x1b[36m\x1b[1m${targetUrl}\x1b[0m`);
console.log('  Ensure your phone and Mac are connected to the SAME Wi-Fi network.\n');

// Render QR code in terminal using qrcode-terminal via npx
const qrProcess = spawn('npx', ['--yes', 'qrcode-terminal', targetUrl, 'small'], {
  stdio: 'inherit',
});

qrProcess.on('close', () => {
  console.log('\n  Point your iPhone 15 / Android Camera at the QR Code above!');
  console.log('  ------------------------------------------------------------');
  console.log(`  Starting production preview server on port ${port}...\n`);

  // Launch vite preview
  const server = spawn('npx', ['vite', 'preview', '--host', '0.0.0.0', '--port', String(port)], {
    stdio: 'inherit',
  });

  server.on('error', (err) => {
    console.error('Failed to start server:', err);
  });
});
