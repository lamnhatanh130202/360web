// frontend/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'public/marzipano.js', // giữ để copy script này sang build
          dest: '.'
        },
        {
          src: 'public/language/*.json', // copy language files
          dest: 'language'
        }
      ]
    })
  ],

  // Đảm bảo public files được serve trong dev mode
  publicDir: 'public',

  server: {
    port: 3000,
    host: '0.0.0.0', // cho phép truy cập từ network
    open: true,

    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      // Chỉ proxy /assets cho các file không có trong public (như ảnh upload từ backend)
      // Files trong public/assets sẽ được Vite serve tự động
      '/assets/anhminhhoa': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      '/language': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      '/tts': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },

  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  },
})
