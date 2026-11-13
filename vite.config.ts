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

export default defineConfig({
  base: './',
  plugins: [
    serveEsmMimePlugin(),
    react(),
    tailwindcss(),
    VitePWA({
      injectRegister: 'script',
      registerType: 'autoUpdate',
      includeManifestIcons: false,
      manifest: {
        name: 'Sol Check',
        short_name: 'Sol Check',
        description: 'Crew health check-in and personal baseline review for a simulated Mars mission.',
        theme_color: '#f5f3ed',
        background_color: '#f5f3ed',
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
          '**/*.{html,js,css,json,csv,svg,png,webp,woff,woff2,wasm,tflite,gz}',
          '**/+esm',
        ],
      },
    }),
  ],
});
