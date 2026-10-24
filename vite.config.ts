import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'

// Local dev only: launches the original Python API next to Vite.
// On Vercel the /api folder (serverless functions) is used instead.
function pythonBackend() {
  let child: ChildProcess | null = null
  return {
    name: 'python-backend',
    apply: 'serve' as const,
    configureServer() {
      child = spawn('python3', [path.resolve(__dirname, 'server/app.py')], { stdio: 'inherit' })
      child.on('error', () => {})
      process.once('exit', () => child?.kill())
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), pythonBackend()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: { chunkSizeWarningLimit: 1500 },
  server: { port: 5173, proxy: { '/api': { target: 'http://127.0.0.1:5000', changeOrigin: true } } },
})
