import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

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

export default defineConfig({
  base: './',
  plugins: [
    serveEsmMimePlugin(),
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
        theme_color: '#070B14',
        background_color: '#070B14',
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
