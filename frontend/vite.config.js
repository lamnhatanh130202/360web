import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'public/marzipano.js',
          dest: '.'
        }
      ]
    })
  ],
  // THÊM TOÀN BỘ MỤC NÀY VÀO
  server: {
    port: 3000, // Chạy server dev ở cổng 3000 (hoặc cổng khác bạn muốn)
    proxy: {
      // Khi frontend gọi /api, server dev sẽ chuyển yêu cầu đến backend
      '/api': {
        target: 'http://localhost:5000', // Địa chỉ của backend container
        changeOrigin: true,
      }
    }
  }
})