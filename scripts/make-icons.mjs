// The app icon: Peek looking up at a peak. One drawing, three palettes.
//
//   dark  - the shipped icon (frontend/public/icon-180.png, icon-512.png)
//   light - the same drawing with the page and Peek swapped
//   gray  - dark with the mountain desaturated, for iOS's tinted home-screen mode. iOS
//           tints by luminance, so what matters is that bg / mountain / Peek land on three
//           clearly different greys; green alone would sit too close to the snow's white
//
// Run from the repo root:   node scripts/make-icons.mjs
// PNGs need sharp, which the repo doesn't depend on. `npm i sharp` in any scratch folder and
// point SHARP_DIR at that folder:
//   SHARP_DIR=/path/to/scratch node scripts/make-icons.mjs
// Without it only the SVGs are written.
//
// Coordinates are in the 360-unit space the artwork was traced in (circle and eyes fitted
// to the reference PNG, mountain edges and snow line measured from it). The mountain is a
// symmetric triangle (edges at about +-0.70 x per y) whose right edge runs off the canvas
// and whose base sits behind Peek, so the polygon is extended past both. The snow cap's
// three-tooth edge is regular: teeth ~17 units apart, ~19 deep.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'assets', 'icons')
const pubDir = join(root, 'frontend', 'public')

const PALETTES = {
  dark:  { bg: '#121211', peek: '#f1f0ec', eye: '#121211', peak: '#1db36b' },
  light: { bg: '#f1f0ec', peek: '#121211', eye: '#f1f0ec', peak: '#1db36b' },
  gray:  { bg: '#121211', peek: '#f1f0ec', eye: '#121211', peak: '#8a8a88' }
}

// Full-bleed square on purpose: iOS applies its own corner mask and fills any transparency
// with black. Everything that matters (both eyes, the summit) sits within the central 80%,
// so Android's circular maskable crop keeps it too.
const svg = c => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 360" width="1024" height="1024">
  <rect width="360" height="360" fill="${c.bg}"/>
  <path d="M244.7 71.8 L479.1 400 H20.2 Z" fill="${c.peak}"/>
  <path d="M244.7 71.8 L295.5 143.8 L280 159.2 L262 139.7 L245 158.5 L228 139.7 L211 158.3 L195.3 144.5 Z" fill="${c.peek}"/>
  <circle cx="85.8" cy="373.8" r="194" fill="${c.peek}"/>
  <rect x="-21.5" y="-48" width="43" height="96" rx="21.5" transform="translate(104 264.7) rotate(-28)" fill="${c.eye}"/>
  <rect x="-17.5" y="-49.5" width="35" height="99" rx="17.5" transform="translate(171.3 252.9) rotate(-30.4)" fill="${c.eye}"/>
</svg>
`

mkdirSync(outDir, { recursive: true })
for (const [name, c] of Object.entries(PALETTES)) writeFileSync(join(outDir, `icon-${name}.svg`), svg(c))
console.log('wrote assets/icons/icon-{dark,light,gray}.svg')

let sharp
try {
  sharp = createRequire(join(process.env.SHARP_DIR || root, 'x.js'))('sharp')
} catch {
  console.log('sharp not found - skipped the PNGs (see the note at the top of this file)')
  process.exit(0)
}
const png = (name, size, file) =>
  sharp(Buffer.from(svg(PALETTES[name])), { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toFile(file)

for (const name of Object.keys(PALETTES)) await png(name, 1024, join(outDir, `icon-${name}-1024.png`))
await png('dark', 512, join(pubDir, 'icon-512.png'))
await png('dark', 180, join(pubDir, 'icon-180.png'))
console.log('wrote assets/icons/*-1024.png and frontend/public/icon-{180,512}.png')
