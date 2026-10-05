// The logic behind choosing an exercise: search, muscle filters, "what you use", the gym's
// equipment, overlap warnings and swaps. Pure — the picker, the library and the swap sheet
// only render what comes out of here, so the ranking can be tested without clicking.
import { MUSCLES, musclesOf, loadOf } from './muscles.js'
import { EXIDX } from './exercises.js'

/* ---------------- what you use ---------------- */

/** How often each exercise turns up in your routines and logged workouts. */
export function usageOf(st) {
  const u = {}
  ;(st.routines || []).forEach(r => (r.ex || []).forEach(e => { u[e.id] = (u[e.id] || 0) + 1 }))
  ;(st.workouts || []).forEach(w => (w.entries || []).forEach(e => { u[e.id] = (u[e.id] || 0) + 1 }))
  return u
}

/** Exercises you have done, most recently done first, then ones only planned so far. */
export function recentIds(st) {
  const seen = new Set(), out = []
  const add = id => { if (id && !seen.has(id)) { seen.add(id); out.push(id) } }
  ;[...(st.workouts || [])].sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0))
    .forEach(w => (w.entries || []).forEach(e => add(e.id)))
  ;(st.routines || []).forEach(r => (r.ex || []).forEach(e => add(e.id)))
  return out
}

/* ---------------- muscles ---------------- */

const primCache = new WeakMap()
/** The one muscle an exercise is mainly for, or null (cardio, or nothing drawable). */
export function primaryOf(ex) {
  if (!ex) return null
  // Cardio lists the legs as helpers, which would file a treadmill under Quads.
  if (ex.bp === 'cardio') return null
  if (primCache.has(ex)) return primCache.get(ex)
  const m = musclesOf(ex)
  let best = null
  for (const k in m) if (!best || m[k] > m[best]) best = k
  primCache.set(ex, best)
  return best
}

/** Supporting muscles, strongest first, without the primary. */
export function secondaryOf(ex) {
  const p = primaryOf(ex), m = musclesOf(ex)
  return MUSCLES.filter(k => k !== p && m[k] > 0).sort((a, b) => m[b] - m[a])
}

/** Does `ex` belong under a muscle chip? 'cardio' is the one chip that isn't a muscle. */
export const matchesMuscle = (ex, chip) =>
  !chip || (chip === 'cardio' ? ex.bp === 'cardio' : primaryOf(ex) === chip)

// Chip order: the muscles people build a day around first, the niche ones last — head-to-toe
// (MUSCLES) would open the row on traps and serratus.
const CHIP_ORDER = ['chest', 'upper-back', 'deltoids', 'biceps', 'triceps', 'quadriceps', 'hamstring',
  'gluteal', 'calves', 'abs', 'obliques', 'lower-back', 'trapezius', 'forearm', 'adductors', 'hip-flexors',
  'serratus', 'tibialis']

/** Muscle chips worth showing for a list — only ones with exercises behind them. */
export function muscleChips(list) {
  const has = new Set(list.map(primaryOf))
  const out = CHIP_ORDER.filter(m => has.has(m))
  if (list.some(e => e.bp === 'cardio')) out.push('cardio')
  return out
}

/* ---------------- specific muscle ("upper chest", not "chest") ---------------- */

// The dataset only knows "pectorals", "delts", "abs". Which part of the muscle a lift
// works is in its name — incline is upper chest, a lateral raise is side delts — so the
// finer label is read from there, inside the main muscle the dataset already gives.
const REGION_RULES = {
  chest: [['Upper chest', /incline|upper|low to high|low cable/], ['Lower chest', /decline|dip|lower|high to low|high cable/]],
  deltoids: [['Rear delts', /rear|reverse fly|revers fly|face pull|bent over lateral/],
    ['Side delts', /lateral|\bside\b|upright|\by raise|\bt raise|iron cross/],
    ['Front delts', /front|forward|press|overhead|military|arnold|push|jerk|thruster/]],
  abs: [['Obliques', /oblique|twist|russian|wood|bicycle|\bside\b|heel touch/],
    ['Lower abs', /leg raise|knee raise|reverse crunch|flutter|scissor|v up|toes to|leg lift/]],
}
const REGION_DEFAULT = { chest: 'Mid chest', deltoids: 'Shoulders', abs: 'Upper abs' }
const REGION_NAME = {
  'upper-back': ex => (ex.tg === 'lats' ? 'Lats' : 'Mid back'), trapezius: 'Traps', 'lower-back': 'Lower back',
  biceps: 'Biceps', triceps: 'Triceps', forearm: 'Forearms', quadriceps: 'Quads', gluteal: 'Glutes',
  hamstring: 'Hamstrings', calves: 'Calves', adductors: 'Inner thighs', obliques: 'Obliques',
  serratus: 'Serratus', 'hip-flexors': 'Hip flexors', tibialis: 'Shins',
}
// The parts of a muscle a suggestion can point at when one part is already crowded.
const REGIONS_OF = {
  chest: ['Upper chest', 'Mid chest', 'Lower chest'],
  deltoids: ['Front delts', 'Side delts', 'Rear delts'],
  abs: ['Upper abs', 'Lower abs', 'Obliques'],
  'upper-back': ['Lats', 'Mid back'],
}

/** The specific muscle an exercise trains — an English label, also the i18n key. */
export function regionOf(ex) {
  if (!ex) return null
  if (ex.bp === 'cardio') return 'Cardio'
  const m = primaryOf(ex)
  if (!m) return null
  const name = norm(ex.n)
  const hit = (REGION_RULES[m] || []).find(([, re]) => re.test(name))
  if (hit) return hit[0]
  const fixed = REGION_NAME[m]
  return REGION_DEFAULT[m] || (typeof fixed === 'function' ? fixed(ex) : fixed) || null
}

/* ---------------- equipment ---------------- */

// Bodyweight work needs no kit and a custom exercise is whatever you made it, so a gym
// profile never hides either.
export const gymAllows = (ex, gymEq) => !gymEq || !!ex.custom || ex.eq === 'body weight' || gymEq.includes(ex.eq)
export const gymFilter = (list, gymEq) => (gymEq ? list.filter(e => gymAllows(e, gymEq)) : list)

// A light thumb on the scale for the kit most gyms have, so "squat" leads with a barbell
// squat rather than a band one. Small enough that a better name match always wins.
const EQ_BONUS = { barbell: 12, dumbbell: 12, cable: 8, 'body weight': 8, 'leverage machine': 6 }

// Stretches and the dataset's filming variants ("(female)", "(back pov)") are rarely what
// anyone is looking for when adding to a plan; they stay findable, just at the bottom.
const isJunk = ex => /stretch|\b(male|female)\b|\bpov\b/.test(String(ex.n).toLowerCase())

/* ---------------- search ---------------- */

const norm = s => String(s || '').toLowerCase().replace(/[-/(),.]+/g, ' ').replace(/\s+/g, ' ').trim()

// Words in a name that say what the movement is, not what it is done with — the part two
// exercises have to share to be the same lift on different kit.
const KIT = new Set(['barbell', 'dumbbell', 'cable', 'lever', 'band', 'smith', 'kettlebell', 'machine',
  'ez', 'weighted', 'assisted', 'resistance', 'olympic', 'with', 'on', 'and', 'the', 'a', 'of'])
const moveWords = ex => new Set(norm(ex.n).split(' ').filter(w => w && !KIT.has(w)))

// What people actually type at the gym. Expanded before matching, so "db row" is "dumbbell row".
const ALIAS = {
  db: 'dumbbell', dbs: 'dumbbell', bb: 'barbell', kb: 'kettlebell', ez: 'ez barbell',
  bw: 'body weight', bodyweight: 'body weight', ohp: 'overhead press', rdl: 'romanian deadlift',
  sldl: 'stiff leg deadlift', pullup: 'pull up', pullups: 'pull up', pushup: 'push up',
  pushups: 'push up', chinup: 'chin up', chinups: 'chin up', situp: 'sit up', situps: 'sit up',
  hammies: 'hamstrings', pecs: 'pectorals',
}

const expand = q => norm(q).split(' ').filter(Boolean).flatMap(w => norm(ALIAS[w] || w).split(' '))

const wordsOf = ex => norm([ex.n, ex.tg, ex.eq, ex.bp, ex.mg, ...(ex.sm || []), ex.desc].join(' ')).split(' ')

/**
 * Exercises matching `q`, best first. Every typed word has to be the start of some word in
 * the exercise (name, muscles, equipment) — so words can come in any order, and "row" no
 * longer finds "narrow". Without a query the list comes back as it was given.
 */
export function searchExercises(list, q, { usage = {} } = {}) {
  const tokens = expand(q)
  if (!tokens.length) return list
  const phrase = tokens.join(' ')
  const scored = []
  for (const ex of list) {
    const words = wordsOf(ex)
    if (!tokens.every(t => words.some(w => w.startsWith(t)))) continue
    const name = norm(ex.n), nameWords = name.split(' ')
    let s = 0
    if (name === phrase) s += 1000
    if (name.includes(phrase)) s += 80
    // Every movement word you did not type makes it a variation of what you asked for —
    // "squat jerk" and "squat on bosu ball" fall behind "dumbbell squat". Kit words are
    // free: names lead with the equipment, which says nothing about the movement.
    s -= 3 * [...moveWords(ex)].filter(w => !tokens.some(t => w.startsWith(t))).length
    if (tokens.every(t => nameWords.some(w => w.startsWith(t)))) s += 100
    s += 15 * tokens.filter(t => nameWords.includes(t)).length
    // Typed a muscle or body part ("chest") — exercises that are *for* it beat ones that
    // merely have the word in their name.
    const about = norm([ex.tg, ex.bp, ex.mg].join(' ')).split(' ')
    if (tokens.every(t => about.some(w => w.startsWith(t)))) s += 10
    s += 15 * Math.min(usage[ex.id] || 0, 5)
    s += EQ_BONUS[ex.eq] || 0
    if (isJunk(ex)) s -= 60
    scored.push({ ex, s, len: name.length })
  }
  return scored.sort((a, b) => b.s - a.s || a.len - b.len || (a.ex.n < b.ex.n ? -1 : 1)).map(x => x.ex)
}

// The lifts a plan is normally built from, roughly in the order you'd reach for them. Name
// rules alone can't tell a staple from an oddity ("handstand", "elevator" are short, plain
// names too), so without a search these lead each muscle — after what you already train.
export const STAPLES = [
  'barbell bench press', 'dumbbell bench press', 'barbell incline bench press', 'dumbbell incline bench press',
  'dumbbell fly', 'chest dip', 'push-up', 'lever chest press', 'barbell decline bench press',
  'pull-up', 'chin-up', 'cable pulldown', 'barbell bent over row', 'dumbbell bent over row', 'cable seated row',
  'lever seated row', 'kettlebell one arm row',
  'dumbbell seated shoulder press', 'barbell seated overhead press', 'dumbbell lateral raise', 'cable lateral raise',
  'dumbbell rear fly', 'dumbbell front raise', 'dumbbell arnold press', 'lever military press',
  'barbell curl', 'dumbbell biceps curl', 'dumbbell hammer curl', 'ez barbell curl', 'cable curl',
  'dumbbell incline curl', 'barbell preacher curl',
  'cable pushdown', 'cable pushdown (with rope attachment)', 'barbell close-grip bench press',
  'barbell lying triceps extension skull crusher', 'cable overhead triceps extension (rope attachment)',
  'dumbbell kickback', 'bench dip (knees bent)',
  'barbell full squat', 'barbell front squat', 'lever leg extension', 'dumbbell lunge', 'dumbbell goblet squat',
  'barbell hack squat', 'dumbbell single leg split squat',
  'barbell romanian deadlift', 'lever lying leg curl', 'lever seated leg curl', 'barbell deadlift', 'dumbbell romanian deadlift',
  'barbell glute bridge', 'lever standing calf raise', 'barbell standing calf raise', 'lever seated calf raise',
  'dumbbell standing calf raise',
  'crunch floor', 'hanging leg raise', 'cable kneeling crunch', 'russian twist', 'weighted front plank',
  'barbell shrug', 'dumbbell shrug', 'hyperextension', 'barbell good morning',
]
const STAPLE_RANK = new Map(STAPLES.map((n, i) => [n, i]))

/**
 * The order of a list nobody has searched in (all, or one muscle chip): what you train,
 * most recent first, then the STAPLES, then the plain version of each movement (common kit,
 * short name) — so "Triceps" opens on pushdowns and close-grip bench, not a towel extension.
 */
export function browseOrder(list, { recent = [] } = {}) {
  const rank = new Map(recent.map((id, i) => [id, i]))
  const plain = ex => (EQ_BONUS[ex.eq] || 0) - 4 * moveWords(ex).size - (isJunk(ex) ? 100 : 0)
  const staple = ex => (STAPLE_RANK.has(ex.n) ? STAPLE_RANK.get(ex.n) : Infinity)
  return list.map(ex => ({ ex, r: rank.has(ex.id) ? rank.get(ex.id) : Infinity, st: staple(ex), p: plain(ex), len: ex.n.length }))
    .sort((a, b) => (a.r - b.r) || (a.st - b.st) || (b.p - a.p) || (a.len - b.len) || (a.ex.n < b.ex.n ? -1 : 1))
    .map(x => x.ex)
}

/* ---------------- overlap ("Peek" warnings) ---------------- */

// With this many exercises for one muscle already in the list, the next one is probably
// a duplicate in disguise rather than a plan.
export const OVERLAP_AT = 2

// Muscles that share a training day. A suggestion stays inside the group, so a third chest
// press on a push day turns into a triceps or shoulder exercise, not a leg one.
const GROUPS = [
  ['chest', 'deltoids', 'triceps'],
  ['upper-back', 'trapezius', 'biceps', 'forearm'],
  ['quadriceps', 'hamstring', 'gluteal', 'calves', 'adductors'],
  ['abs', 'obliques', 'lower-back'],
]

const exOf = id => EXIDX[id]

/**
 * The list already has OVERLAP_AT+ other exercises for the exact same part of the muscle
 * → { region, muscle, ids }. An incline press next to two flat ones is not a repeat.
 */
export function overlapFor(list, exId) {
  const ex = exOf(exId), m = primaryOf(ex), region = regionOf(ex)
  if (!m || !region) return null
  const ids = [...new Set((list || []).map(e => e.id))]
    .filter(id => id !== exId && primaryOf(exOf(id)) === m && regionOf(exOf(id)) === region)
  return ids.length >= OVERLAP_AT ? { region, muscle: m, ids } : null
}

const rankAlt = (usage, eq) => (a, b) =>
  isJunk(a) - isJunk(b) ||
  (usage[b.id] || 0) - (usage[a.id] || 0) ||
  (eq ? (b.eq === eq) - (a.eq === eq) : 0) ||
  (EQ_BONUS[b.eq] || 0) - (EQ_BONUS[a.eq] || 0) ||
  a.n.length - b.n.length || (a.n < b.n ? -1 : 1)

/**
 * When adding `exId` would overlap, something the list is missing instead → { overlap, ex }:
 * first a part of the same muscle nothing in the list trains yet (two flat presses → an
 * incline one), else the neighbouring muscle the day neglects most. Just { overlap } when
 * neither turns anything up, null when there is no overlap at all.
 */
export function suggestionFor(list, exId, all, { gymEq = null, usage = {} } = {}) {
  const overlap = overlapFor(list, exId)
  if (!overlap) return null
  const inList = new Set((list || []).map(e => e.id))
  const cand = exOf(exId)
  const have = new Set([...inList].map(id => regionOf(exOf(id))))
  for (const region of REGIONS_OF[overlap.muscle] || []) {
    if (have.has(region)) continue
    const pool = all.filter(e => !inList.has(e.id) && e.id !== exId && gymAllows(e, gymEq) &&
      primaryOf(e) === overlap.muscle && regionOf(e) === region)
    if (pool.length) return { overlap, ex: pool.sort(rankAlt(usage, cand && cand.eq))[0] }
  }
  const group = GROUPS.find(g => g.includes(overlap.muscle))
  if (!group) return { overlap }
  const load = loadOf((list || []).map(e => ({ id: e.id, sets: 1 })))
  // "Short of work" = less than one exercise's worth, counting supporting roles at 0.4.
  const short = group.filter(m => m !== overlap.muscle && (load[m] || 0) < 1)
    .sort((a, b) => (load[a] || 0) - (load[b] || 0) || group.indexOf(a) - group.indexOf(b))
  for (const muscle of short) {
    const pool = all.filter(e => !inList.has(e.id) && e.id !== exId && gymAllows(e, gymEq) && primaryOf(e) === muscle)
    if (pool.length) return { overlap, ex: pool.sort(rankAlt(usage, cand && cand.eq))[0] }
  }
  return { overlap }
}

/** Alternatives for `ex` — same main muscle, not already in the list — closest movement first. */
export function similarTo(ex, all, { exclude = [], gymEq = null, usage = {} } = {}) {
  const m = primaryOf(ex)
  const skip = new Set([ex.id, ...exclude])
  const mine = moveWords(ex), sec = new Set(secondaryOf(ex))
  const score = e => {
    let s = 0
    moveWords(e).forEach(w => { if (mine.has(w)) s += 30 })
    secondaryOf(e).forEach(k => { if (sec.has(k)) s += 5 })
    return s + 10 * Math.min(usage[e.id] || 0, 3) + (EQ_BONUS[e.eq] || 0) - (isJunk(e) ? 60 : 0)
  }
  return all.filter(e => !skip.has(e.id) && gymAllows(e, gymEq) &&
    (m ? primaryOf(e) === m : ex.bp === 'cardio' && e.bp === 'cardio'))
    .map(e => ({ e, s: score(e) }))
    .sort((a, b) => b.s - a.s || a.e.n.length - b.e.n.length || (a.e.n < b.e.n ? -1 : 1))
    .map(x => x.e)
}
