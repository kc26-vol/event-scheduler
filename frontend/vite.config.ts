import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// バックエンド (uvicorn) へのプロキシ設定
// 開発時は `pnpm dev` (localhost:5173) からバックエンド (localhost:8000) へ中継する
const backend = process.env.BACKEND_URL || 'http://localhost:8000'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': backend,
      '/auth': backend,
      '/uploads': backend,
      '/public': backend,
    },
  },
})
