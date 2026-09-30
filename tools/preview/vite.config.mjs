// Builds tools/preview (the real app + example data + the Preview menu) with the frontend's
// own dependencies; inline.mjs then folds it into the one HTML file the artifact serves.
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import react from '../../frontend/node_modules/@vitejs/plugin-react/dist/index.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const fe = path.resolve(here, '../../frontend/node_modules')
export default {
  root: here,
  plugins: [react()],
  // files in tools/preview import React too; point them at the frontend's single copy
  resolve: { alias: [
    { find: /^react-dom\/client$/, replacement: fe + '/react-dom/client.js' },
    { find: /^react\/jsx-runtime$/, replacement: fe + '/react/jsx-runtime.js' },
    { find: /^react\/jsx-dev-runtime$/, replacement: fe + '/react/jsx-dev-runtime.js' },
    { find: /^react$/, replacement: fe + '/react/index.js' }
  ] },
  logLevel: 'warn',
  build: { outDir: path.join(here, 'out/dist'), emptyOutDir: true, modulePreload: false, cssCodeSplit: false, assetsInlineLimit: 1e9, chunkSizeWarningLimit: 1e5,
    rolldownOptions: { output: { codeSplitting: false } } }
}
