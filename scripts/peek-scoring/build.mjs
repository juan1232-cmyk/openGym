// Builds exercise-ratings.json from the hand-written inputs next to this file:
//   archetypes/*.txt one line per movement type: the ratings every exercise of that type shares
//   assign/*.txt     one line per exercise: its dataset id, the archetype it is an instance of,
//                    and any per-exercise adjustments (spec section 4: unilateral, partial, …)
// then validates against the spec (v2), runs the section-6 scoring code and writes the result.
//
//   node scripts/peek-scoring/build.mjs                 build + validate + summary
//   node scripts/peek-scoring/build.mjs --muscle lats   also print that muscle's ranking
//
// archetype line:  key | muscle:S:L,muscle:S:L | secondary,secondary | St P T C | studied | conf | note
//   secondary / studied are "-" when empty; conf is high|medium|low (h|m|l).
// assignment line: <dataset id> <archetype key> [mod …]      or      <dataset id> SKIP <reason>
//   mods:  St-1  P+1  T=5  C-1   (whole-exercise ratings)
//          S=5   L-1  S1=4       (per-target; no digit = first target, S1 = second)
//          conf=low   eq=cable   studied=seated_leg_curl|none   note=Some_words_with_underscores
//          sec=+glutes,-forearms   (add / drop secondary muscles)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { EXDB } from '../../frontend/src/lib/exercises-data.js'
import { score, scoreExercise } from './score.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

const MUSCLES = new Set(['chest', 'upper_chest', 'front_delts', 'side_delts', 'rear_delts', 'lats', 'upper_back', 'traps',
  'biceps', 'triceps', 'forearms', 'abs', 'obliques', 'lower_back', 'glutes', 'quads', 'hamstrings', 'adductors',
  'abductors', 'calves', 'neck'])
const EQUIPMENT = new Set(['barbell', 'dumbbell', 'cable', 'machine', 'smith', 'bodyweight', 'band', 'kettlebell', 'other'])
const STUDIED = new Set(['overhead_triceps_ext', 'triceps_pushdown', 'seated_leg_curl', 'lying_leg_curl',
  'standing_calf_raise', 'seated_calf_raise', 'leg_ext_reclined', 'leg_ext_upright'])
const CONF = { h: 'high', m: 'medium', l: 'low', high: 'high', medium: 'medium', low: 'low' }
const EQ_OF = {
  'body weight': 'bodyweight', cable: 'cable', 'leverage machine': 'machine', 'sled machine': 'machine',
  'smith machine': 'smith', assisted: 'machine', barbell: 'barbell', 'ez barbell': 'barbell',
  'olympic barbell': 'barbell', 'trap bar': 'barbell', dumbbell: 'dumbbell', band: 'band', 'resistance band': 'band',
  kettlebell: 'kettlebell', weighted: 'bodyweight'
}

// The 19 rated anchors from spec section 3. The build refuses to run if an exercise sharing
// one of these ids drifts from them.
const ANCHORS = [
  ['0592', 'biceps', 7, 9, 9, 7, 2, 1], ['0318', 'biceps', 8, 8, 7, 6, 2, 1],
  ['0605', 'calves', 9, 8, 8, 8, 1, 2], ['0594', 'calves', 3, 8, 9, 8, 1, 1],
  ['0227', 'chest', 8, 8, 8, 7, 2, 2], ['0577', 'chest', 6, 8, 9, 8, 5, 4], ['0025', 'chest', 6, 7, 6, 9, 10, 6],
  ['0599', 'hamstrings', 9, 9, 10, 8, 2, 2], ['0586', 'hamstrings', 6, 9, 9, 8, 2, 2], ['0085', 'hamstrings', 8, 6, 5, 7, 7, 8],
  ['2330', 'lats', 8, 7, 9, 8, 5, 3],
  ['0585', 'quads', 7, 10, 10, 8, 2, 2], ['0743', 'quads', 8, 8, 9, 8, 6, 6], ['0043', 'quads', 7, 6, 5, 8, 10, 9],
  ['0178', 'side_delts', 6, 8, 8, 6, 1, 1], ['0334', 'side_delts', 2, 8, 7, 5, 1, 1],
  ['0194', 'triceps', 9, 9, 8, 8, 2, 2], ['0201', 'triceps', 4, 9, 9, 8, 2, 1],
  ['0327', 'upper_back', 6, 8, 9, 8, 5, 3]
]

const errors = []
const err = (m) => errors.push(m)
const lines = (file) => fs.readFileSync(file, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'))

/* ---------------- archetypes ---------------- */
const ARCH = {}
const archFiles = fs.readdirSync(path.join(HERE, 'archetypes')).filter(f => f.endsWith('.txt')).sort()
for (const l of archFiles.flatMap(f => lines(path.join(HERE, 'archetypes', f)))) {
  const p = l.split('|').map(s => s.trim())
  if (p.length !== 7) { err(`archetype needs 7 fields: ${l}`); continue }
  const [key, tg, sec, rest, studied, conf, note] = p
  if (ARCH[key]) err(`duplicate archetype ${key}`)
  const [St, P, T, C] = rest.split(/\s+/).map(Number)
  ARCH[key] = {
    targets: tg.split(',').map(t => { const [muscle, S, L] = t.split(':'); return { muscle, S: +S, L: +L } }),
    secondary: sec === '-' ? [] : sec.split(','),
    St, P, T, C, studied: studied === '-' ? '' : studied, confidence: CONF[conf], note
  }
  if (!CONF[conf]) err(`archetype ${key}: bad confidence ${conf}`)
}

/* ---------------- assignments ---------------- */
const ASSIGN = new Map()
const dir = path.join(HERE, 'assign')
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.txt')).sort()) {
  for (const l of lines(path.join(dir, f))) {
    const [id, key, ...mods] = l.split(/\s+/)
    if (ASSIGN.has(id)) err(`${f}: ${id} assigned twice`)
    ASSIGN.set(id, { key, mods, file: f })
  }
}

const byId = new Map(EXDB.map(e => [e.id, e]))
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

function applyMods(ex, mods, ctx) {
  for (const m of mods) {
    let r
    if ((r = m.match(/^(St|P|T|C)([+\-=])(\d+)$/))) {
      const v = +r[3]; ex[r[1]] = r[2] === '=' ? v : r[2] === '+' ? ex[r[1]] + v : ex[r[1]] - v
    } else if ((r = m.match(/^([SL])(\d?)([+\-=])(\d+)$/))) {
      const t = ex.targets[r[2] ? +r[2] : 0]
      if (!t) { err(`${ctx}: no target ${r[2] || 0} for ${m}`); continue }
      const v = +r[4]; t[r[1]] = r[3] === '=' ? v : r[3] === '+' ? t[r[1]] + v : t[r[1]] - v
    } else if ((r = m.match(/^conf=(\w+)$/))) {
      if (!CONF[r[1]]) err(`${ctx}: bad conf ${r[1]}`); else ex.confidence = CONF[r[1]]
    } else if ((r = m.match(/^eq=(\w+)$/))) {
      ex.equipment = r[1]
    } else if ((r = m.match(/^studied=(\w+)$/))) {
      ex.studied = r[1] === 'none' ? '' : r[1]
    } else if ((r = m.match(/^note=(.+)$/))) {
      ex.notes = r[1].replace(/_/g, ' ')
    } else if ((r = m.match(/^sec=(.+)$/))) {
      for (const s of r[1].split(',')) {
        if (s.startsWith('+')) { if (!ex.secondary.includes(s.slice(1))) ex.secondary.push(s.slice(1)) }
        else if (s.startsWith('-')) ex.secondary = ex.secondary.filter(x => x !== s.slice(1))
        else err(`${ctx}: sec mod needs +/-: ${s}`)
      }
    } else err(`${ctx}: unknown mod ${m}`)
  }
}

/* ---------------- build ---------------- */
const out = []
const usedIds = new Set()
for (const e of EXDB) {
  const a = ASSIGN.get(e.id)
  if (!a) { err(`unassigned: ${e.id} ${e.n}`); continue }
  let id = slug(e.n)
  if (usedIds.has(id)) id = `${id}_${e.id}`
  usedIds.add(id)
  const name = cap(e.n)
  if (a.key === 'SKIP') { out.push({ id, exId: e.id, name, skip: a.mods.join(' ').replace(/_/g, ' ') }); continue }
  const base = ARCH[a.key]
  if (!base) { err(`${e.id} ${e.n}: unknown archetype ${a.key}`); continue }
  const ex = {
    id, exId: e.id, name, equipment: EQ_OF[e.eq] || 'other',
    targets: base.targets.map(t => ({ ...t })), secondary: [...base.secondary],
    St: base.St, P: base.P, T: base.T, C: base.C, studied: base.studied, confidence: base.confidence,
    notes: base.note.replace(/\s*\[anchor\]$/, '')
  }
  applyMods(ex, a.mods, `${e.id} ${e.n}`)
  out.push(ex)
}
for (const id of ASSIGN.keys()) if (!byId.has(id)) err(`assignment for unknown dataset id ${id}`)

/* ---------------- validate ---------------- */
const isRating = (v) => Number.isInteger(v) && v >= 0 && v <= 10
for (const ex of out) {
  if (ex.skip !== undefined) { if (!ex.skip) err(`${ex.exId}: empty skip reason`); continue }
  const c = `${ex.exId} ${ex.name}`
  if (!EQUIPMENT.has(ex.equipment)) err(`${c}: equipment ${ex.equipment}`)
  if (ex.targets.length < 1 || ex.targets.length > 3) err(`${c}: ${ex.targets.length} targets`)
  const seen = new Set()
  for (const t of ex.targets) {
    if (!MUSCLES.has(t.muscle)) err(`${c}: muscle ${t.muscle}`)
    if (seen.has(t.muscle)) err(`${c}: duplicate target ${t.muscle}`)
    seen.add(t.muscle)
    if (!isRating(t.S) || !isRating(t.L)) err(`${c}: S/L out of range for ${t.muscle}`)
  }
  for (const s of ex.secondary) {
    if (!MUSCLES.has(s)) err(`${c}: secondary muscle ${s}`)
    if (seen.has(s)) err(`${c}: ${s} is both target and secondary`)
  }
  for (const k of ['St', 'P', 'T', 'C']) if (!isRating(ex[k])) err(`${c}: ${k}=${ex[k]}`)
  if (ex.studied && !STUDIED.has(ex.studied)) err(`${c}: studied ${ex.studied}`)
  if (!ex.notes) err(`${c}: no note`)
  ex.scores = scoreExercise(ex)
}

// Anchors: exact match with spec section 3, and the spec's own check value.
const chk = score(9, 9, 8, 8, 2, 2)
if (chk.score !== 67 || chk.H_eff !== 71 || chk.Str !== 54) err(`scoring code check failed: ${JSON.stringify(chk)}`)
for (const [id, muscle, S, L, St, P, T, C] of ANCHORS) {
  const ex = out.find(x => x.exId === id)
  const t = ex && ex.targets && ex.targets.find(x => x.muscle === muscle)
  const got = t && [t.S, t.L, ex.St, ex.P, ex.T, ex.C].join()
  if (!t) err(`anchor ${id} (${muscle}) missing`)
  else if (got !== [S, L, St, P, T, C].join()) err(`anchor ${id} ${ex.name}: got ${got}, spec says ${[S, L, St, P, T, C].join()}`)
}

if (process.argv.includes('--partial')) for (let i = errors.length - 1; i >= 0; i--) if (/^unassigned|^anchor .* missing/.test(errors[i])) errors.splice(i, 1)
if (errors.length) {
  console.error(`${errors.length} problem(s):`)
  for (const m of errors.slice(0, 80)) console.error('  ' + m)
  if (errors.length > 80) console.error(`  … and ${errors.length - 80} more`)
  if (!process.argv.includes('--force')) process.exit(1)
}

/* ---------------- write + report ---------------- */
const rated = out.filter(x => !x.skip)
const skipped = out.filter(x => x.skip)
const low = rated.filter(x => x.confidence === 'low')
const key = (x) => ({ id: x.id, exId: x.exId, name: x.name, equipment: x.equipment, targets: x.targets, secondary: x.secondary,
  St: x.St, P: x.P, T: x.T, C: x.C, studied: x.studied, confidence: x.confidence, notes: x.notes, scores: x.scores })
fs.writeFileSync(path.join(HERE, 'exercise-ratings.json'), JSON.stringify(out.map(x => x.skip ? x : key(x)), null, 2) + '\n')
fs.writeFileSync(path.join(HERE, 'review-low-confidence.md'),
  `# Low-confidence ratings for human review (${low.length})\n\n` +
  low.map(x => `- **${x.name}** (${x.exId}, ${x.equipment}) — ${x.targets.map(t => `${t.muscle} S${t.S} L${t.L}`).join(', ')}; St${x.St} P${x.P} T${x.T} C${x.C}. ${x.notes}`).join('\n') + '\n')

console.log(`dataset ${EXDB.length} · scored ${rated.length} · skipped ${skipped.length} · low confidence ${low.length}`)
const conf = {}; rated.forEach(x => { conf[x.confidence] = (conf[x.confidence] || 0) + 1 })
console.log('confidence', conf)

const mi = process.argv.indexOf('--muscle')
if (mi > 0) {
  const m = process.argv[mi + 1]
  const groups = new Map()
  for (const ex of rated) for (const t of ex.targets) if (t.muscle === m) {
    const sc = ex.scores[m]
    const sig = `${String(sc.score).padStart(3)} H${String(sc.H_eff).padStart(3)} Str${String(sc.Str).padStart(3)} | S${t.S} L${t.L} St${ex.St} P${ex.P} T${ex.T} C${ex.C}`
    const g = groups.get(sig) || { s: sc.score, sig, names: [] }
    g.names.push(`${ex.name}${ex.confidence === 'low' ? '(low)' : ''}`)
    groups.set(sig, g)
  }
  // Exercises with identical ratings collapse to one line, so the order reads at a glance.
  const rows = [...groups.values()].sort((x, y) => y.s - x.s)
  console.log(`\n${m}: ${rated.filter(x => x.targets.some(t => t.muscle === m)).length} rated`)
  for (const g of rows) console.log(`${g.sig} | x${g.names.length} ${g.names.slice(0, 3).join('; ')}${g.names.length > 3 ? '; ...' : ''}`)
}
