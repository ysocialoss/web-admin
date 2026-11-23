import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const target = process.env.API_URL || 'http://127.0.0.1:3100'
const proxy = { '/api': target, '/auth': target, '/health': target }

const build = process.env.APP_BUILD || Date.now().toString(36)
const version = JSON.stringify({ build })

function appVersion(): Plugin {
  return {
    name: 'app-version',
    configureServer(server) {
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(version)
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: version })
    },
  }
}

export default defineConfig({
  define: { __APP_BUILD__: JSON.stringify(build) },
  plugins: [react(), appVersion()],
  server: { port: 3200, strictPort: true, proxy },
  preview: { port: 3200, strictPort: true, proxy },
})
