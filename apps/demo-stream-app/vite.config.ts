import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  root: 'src/renderer',

  // 關鍵：Electron 用 file:// 載入 index.html，資源路徑必須是相對的。
  // 少了這行，Web 跑得起來但 Electron 會白畫面。
  base: './',

  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },

  server: {
    port: 5173,
    strictPort: true,
  },
})
