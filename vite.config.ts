import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      // 上调单 chunk 警告阈值，避免 build 日志被告警刷屏
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          // 把大型第三方库拆到独立 chunk，便于浏览器并行下载 + 长期缓存
          // 文件名带 hash → cache-control immutable 永久缓存
          manualChunks: {
            'vendor-recharts': ['recharts'],
            'vendor-motion': ['motion'],
            'vendor-icons': ['lucide-react'],
            // xlsx + exceljs 已改为 dynamic import，Rollup 会自动按需拆 chunk
            // react / react-dom 由 Rollup 自动按依赖分配，不再手动拆出（手动列会产生空 chunk）
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
