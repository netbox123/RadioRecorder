import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  plugins: [vue()],
  build: { outDir: 'dist' },
  server: {
    proxy: {
      '/api': 'http://localhost:3003',
      '/ws': { target: 'ws://localhost:3003', ws: true },
      '/recordings': 'http://localhost:3003',
    }
  }
});
