import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

const apiProxyOrigin =
  process.env.API_PROXY_ORIGIN ?? 'http://127.0.0.1:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // ngrok and similar tunnels use a changing hostname; Vite blocks unknown Host headers by default
    allowedHosts: ['.ngrok-free.app', '.ngrok.io', '.ngrok.app'],
    proxy: {
      '/api': {
        target: apiProxyOrigin,
        changeOrigin: true,
      },
    },
  },
})
