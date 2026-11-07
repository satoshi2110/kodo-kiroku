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
        background_color: '#f1f6f8',
        theme_color: '#1a6a86',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // 丸い書体（Zen Maru Gothic）は文字の範囲ごとに 120 個ほどに分かれている。全部を先に入れると重いので、
        // 画面で使った分だけを一度読んだら端末にしまい、次からはオフラインでもそこから出す
        globIgnores: ['**/zen-maru-gothic-*'],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/zen-maru-gothic-.*\.woff2?$/,
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
        navigateFallback: '/index.html',
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 5173, host: true },
});
