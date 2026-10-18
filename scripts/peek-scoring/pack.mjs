// Packs exercise-ratings.json into the file the app loads (frontend/src/lib/ratings-data.json).
// The app needs the ratings, not the prose: names come from the exercise dataset, the scores
// are recomputed by lib/score.js (and checked against this file's `scores` by score.test.js),
// and the notes alone are about 40 % of the size. Skipped exercises are left out — the app
// treats "not in the table" as "never rated".
//
//   node scripts/peek-scoring/pack.mjs
//
// Shape, keyed by dataset id (exId):
//   { t: [[muscle, S, L], …], x: [secondary muscle, …], St, P, T, C, y: studied tag, f: h|m|l }
// `x` and `y` are left out when empty.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const src = JSON.parse(readFileSync(join(here, 'exercise-ratings.json'), 'utf8'))
const out = {}
for (const r of src) {
  if (r.skip) continue
  const o = { t: r.targets.map(t => [t.muscle, t.S, t.L]) }
  if (r.secondary.length) o.x = r.secondary
  Object.assign(o, { St: r.St, P: r.P, T: r.T, C: r.C })
  if (r.studied) o.y = r.studied
  o.f = r.confidence[0]
  out[r.exId] = o
}
const dest = join(here, '..', '..', 'frontend', 'src', 'lib', 'ratings-data.json')
writeFileSync(dest, JSON.stringify(out) + '\n')
console.log(`${Object.keys(out).length} rated exercises → ${dest}`)
