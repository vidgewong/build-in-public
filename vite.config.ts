import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_TARGET = process.env.VITE_API_TARGET ?? 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [react()],
  server: {
    // 开发时把 /api 转给本地 API 服务，前端代码里就只写同源路径
    // 不改写 Host：线上 nginx 也是原样透传，admin 的同源校验靠 Host 和 Origin 对得上
    proxy: { '/api': { target: API_TARGET, changeOrigin: false } },
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 2048,
  },
});
