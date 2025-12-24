// cms-frontend/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/cms/',
  plugins: [react()],
  build: {
    outDir: 'dist'
  },
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        // nếu backend nằm ở /api, không cần rewrite
      },
      // nếu client có thể gọi /cms/api/... thì thêm rewrite:
      '/cms/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/cms\/api/, '/api')
      }
    }
  }
})
