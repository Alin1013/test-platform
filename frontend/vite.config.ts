/**
 * Vite 构建配置：开发服务器代理与构建阈值。
 */
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 56789,
    strictPort: true,
    proxy: {
      // 开发环境下把 API 与上传文件请求代理到本地后端。
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
  },
});
