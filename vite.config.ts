import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';

function serveEsmMimePlugin(): Plugin {
  return {
    name: 'serve-esm-mime-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req as { url?: string }).url;
        if (url && url.includes('+esm')) {
          res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        }
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req as { url?: string }).url;
        if (url && url.includes('+esm')) {
          res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        }
        next();
      });
    },
  };
}

/** `SOLCHECK_TARGET=native` builds the bundle for the Capacitor iOS/Android shells (no service worker). */
const isNativeBuild = process.env.SOLCHECK_TARGET === 'native';
/**
 * `SOLCHECK_HTTPS=1` serves dev/preview over HTTPS with a local self-signed certificate,
 * so phones on the same Wi-Fi can use the camera (browsers only allow the camera on
 * https:// or localhost). Off by default; never affects the built files.
 */
const useLocalHttps = process.env.SOLCHECK_HTTPS === '1';

/**
 * Local testing only: `SOLCHECK_HTTPS_PORT=4174 vite preview` sends phones that open the
 * plain http:// address to the https:// server on that port, because phones only allow the
 * camera on https:// (localhost on the same computer is exempt and is not redirected).
 */
function phoneHttpsRedirectPlugin(): Plugin {
  const httpsPort = process.env.SOLCHECK_HTTPS_PORT;
  return {
    name: 'sol-check-phone-https-redirect',
    configurePreviewServer(server) {
      if (!httpsPort) return;
      server.middlewares.use((req, res, next) => {
        const host = (req.headers.host ?? '').replace(/:\d+$/, '');
        const local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
        const encrypted = Boolean((req.socket as { encrypted?: boolean }).encrypted);
        // App downloads (Android .apk) need no camera, so they are served over plain http without a warning.
        if ((req.url ?? '').endsWith('.apk')) {
          res.setHeader('Content-Type', 'application/vnd.android.package-archive');
          res.setHeader('Content-Disposition', 'attachment; filename="sol-check.apk"');
          return next();
        }
        if (local || encrypted || !host) return next();
        res.statusCode = 302;
        res.setHeader('Location', `https://${host}:${httpsPort}${req.url ?? '/'}`);
        res.end();
      });
    },
  };
}

export default defineConfig({
  base: './',
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  plugins: [
    ...(useLocalHttps ? [basicSsl({ name: 'sol-check-local' })] : []),
    serveEsmMimePlugin(),
    phoneHttpsRedirectPlugin(),
    react(),
    tailwindcss(),
    VitePWA({
      // Native shells ship every asset inside the app bundle; a service worker would only add stale-cache risk.
      disable: isNativeBuild,
      injectRegister: 'script',
      registerType: 'autoUpdate',
      includeManifestIcons: false,
      manifest: {
        name: 'Sol Check',
        short_name: 'Sol Check',
        description: 'Crew health check-in and personal baseline review for a simulated Mars mission.',
        theme_color: '#100F0E',
        background_color: '#100F0E',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'sol-check-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'sol-check-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        importScripts: ['sw-esm-mime.js'],
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
        globPatterns: [
          '**/*.{html,js,css,json,csv,svg,png,webp,woff,woff2,wasm,tflite,gz,glb}',
          '**/+esm',
        ],
      },
    }),
  ],
});
