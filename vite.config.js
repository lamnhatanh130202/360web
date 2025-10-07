import { defineConfig } from 'vite'

export default defineConfig({
  base: '/',                 // để Nginx SPA hoạt động đúng
  build: {
    outDir: 'dist',          // khớp docker-compose (./dist)
    emptyOutDir: true
  }
})
