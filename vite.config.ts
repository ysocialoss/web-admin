import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const target = process.env.API_URL || 'http://127.0.0.1:3100'
const proxy = { '/api': target, '/auth': target, '/health': target }

export default defineConfig({
  plugins: [react()],
  server: { port: 3200, strictPort: true, proxy },
  preview: { port: 3200, strictPort: true, proxy },
})
