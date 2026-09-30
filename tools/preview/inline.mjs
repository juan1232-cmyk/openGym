// Folds out/dist into out/peek-preview.html: one self-contained page (the artifact host wraps
// it in its own <html>/<head>/<body>, so those go; the title goes first so the host finds it).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(here, 'out/dist')
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
const files = fs.readdirSync(path.join(dist, 'assets'))
const read = ext => files.filter(f => f.endsWith(ext)).map(f => fs.readFileSync(path.join(dist, 'assets', f), 'utf8')).join('\n')
const js = read('.js').replace(/<\/script/gi, '<\\/script')
const css = read('.css').replace(/<\/style/gi, '<\\/style')
const title = (html.match(/<title>.*?<\/title>/) || ['<title>Peek Coach Preview</title>'])[0]
const out = `${title}\n<style>${css}</style>\n<div id="root"></div>\n<script type="module">${js}</script>\n`
fs.writeFileSync(path.join(here, 'out/peek-preview.html'), out)
console.log('out/peek-preview.html', (out.length / 1e6).toFixed(2) + ' MB')
