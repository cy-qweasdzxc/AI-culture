/// <reference types="vitest/config" />
import path from 'node:path'
import http from 'node:http'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    host: '127.0.0.1',
    proxy: {
      // 开发模式将 API 转发给本地 FastAPI
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8000',
        // Preserve the browser Host so the backend can validate same-origin LAN requests.
        changeOrigin: false,
        // Reuse loopback sockets during repeated mobile refreshes and E2E runs.
        agent: new http.Agent({ keepAlive: true, maxSockets: 32, maxFreeSockets: 8 }),
      },
    },
  },
  test: {
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    environment: 'jsdom',
    setupFiles: './src/tests/setup.ts',
    css: false,
  },
})
