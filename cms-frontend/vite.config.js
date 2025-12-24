// cms-frontend/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => {
  // Kiểm tra: nếu command là 'serve' thì là đang chạy dev ở local
  const isDev = command === 'serve'

  return {
    base: isDev ? '/cms/' : '/',

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
        },
        // Proxy này giúp bạn gọi /cms/api ở local vẫn ăn vào backend
        '/cms/api': {
          target: 'http://localhost:5000',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/cms\/api/, '/api')
        }
      }
    }
  }
})