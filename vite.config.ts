import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: '行動記録 ― 支援記録・共有アプリ',
        short_name: '行動記録',
        description: '強度行動障害のある人のための ABC記録・行動記録・グラフ・チーム共有',
        lang: 'ja',
        start_url: '/',
        display: 'standalone',
        background_color: '#f4f5f7',
        theme_color: '#1d4ed8',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: '/index.html',
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 5173, host: true },
});
