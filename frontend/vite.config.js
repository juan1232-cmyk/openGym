import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

const backend = process.env.API_TARGET || 'http://127.0.0.1:3000'
const media = process.env.MEDIA_TARGET || 'http://127.0.0.1:8888'

// Which commit a build is, for the device page to say which version you're looking at. Vercel
// sets these for every deploy; a local build asks git, and a build with neither says nothing.
const git = cmd => { try { return execSync('git ' + cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return '' } }
const env = process.env
const build = {
  sha: env.VERCEL_GIT_COMMIT_SHA || git('rev-parse HEAD'),
  ref: env.VERCEL_GIT_COMMIT_REF || git('rev-parse --abbrev-ref HEAD'),
  msg: env.VERCEL_GIT_COMMIT_MESSAGE || git('log -1 --format=%s')
}

export default defineConfig({
  plugins: [react()],
  base: './',
  define: { __BUILD__: JSON.stringify(build) },
  server: {
    proxy: {
      '/api': { target: backend, changeOrigin: true },
      '/img': { target: media, changeOrigin: true },
      '/gif': { target: media, changeOrigin: true }
    }
  },
  build: {
    chunkSizeWarningLimit: 1500,
    // the app, and the device page that shows it inside an iPhone (device.html)
    rollupOptions: { input: { main: 'index.html', device: 'device.html' } }
  }
})
