import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path' // 引入 path 模块

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // 配置 @ 符号指向 src 目录
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    assetsInlineLimit: 0
  }
})
