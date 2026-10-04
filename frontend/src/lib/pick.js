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

/* ---------------- equipment ---------------- */

// Bodyweight work needs no kit and a custom exercise is whatever you made it, so a gym
// profile never hides either.
export const gymAllows = (ex, gymEq) => !gymEq || !!ex.custom || ex.eq === 'body weight' || gymEq.includes(ex.eq)
export const gymFilter = (list, gymEq) => (gymEq ? list.filter(e => gymAllows(e, gymEq)) : list)

// A light thumb on the scale for the kit most gyms have, so "squat" leads with a barbell
// squat rather than a band one. Small enough that a better name match always wins.
const EQ_BONUS = { barbell: 12, dumbbell: 12, cable: 8, 'body weight': 8, 'leverage machine': 6 }

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
    scored.push({ ex, s, len: name.length })
  }
  return scored.sort((a, b) => b.s - a.s || a.len - b.len || (a.ex.n < b.ex.n ? -1 : 1)).map(x => x.ex)
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

/** The list already has OVERLAP_AT+ other exercises for this one's main muscle → { muscle, ids }. */
export function overlapFor(list, exId) {
  const m = primaryOf(exOf(exId))
  if (!m) return null
  const ids = [...new Set((list || []).map(e => e.id))].filter(id => id !== exId && primaryOf(exOf(id)) === m)
  return ids.length >= OVERLAP_AT ? { muscle: m, ids } : null
}

const rankAlt = (usage, eq) => (a, b) =>
  (usage[b.id] || 0) - (usage[a.id] || 0) ||
  (eq ? (b.eq === eq) - (a.eq === eq) : 0) ||
  (EQ_BONUS[b.eq] || 0) - (EQ_BONUS[a.eq] || 0) ||
  a.n.length - b.n.length || (a.n < b.n ? -1 : 1)

/**
 * When adding `exId` would overlap, the neighbouring muscle the list neglects most and an
 * exercise for it → { overlap, muscle, ex }. Just { overlap } when nothing nearby is short
 * of work, null when there is no overlap at all.
 */
export function suggestionFor(list, exId, all, { gymEq = null, usage = {} } = {}) {
  const overlap = overlapFor(list, exId)
  if (!overlap) return null
  const group = GROUPS.find(g => g.includes(overlap.muscle))
  if (!group) return { overlap }
  const load = loadOf((list || []).map(e => ({ id: e.id, sets: 1 })))
  const inList = new Set((list || []).map(e => e.id))
  const cand = exOf(exId)
  // "Short of work" = less than one exercise's worth, counting supporting roles at 0.4.
  const short = group.filter(m => m !== overlap.muscle && (load[m] || 0) < 1)
    .sort((a, b) => (load[a] || 0) - (load[b] || 0) || group.indexOf(a) - group.indexOf(b))
  for (const muscle of short) {
    const pool = all.filter(e => !inList.has(e.id) && e.id !== exId && gymAllows(e, gymEq) && primaryOf(e) === muscle)
    if (pool.length) return { overlap, muscle, ex: pool.sort(rankAlt(usage, cand && cand.eq))[0] }
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
    return s + 10 * Math.min(usage[e.id] || 0, 3) + (EQ_BONUS[e.eq] || 0)
  }
  return all.filter(e => !skip.has(e.id) && gymAllows(e, gymEq) &&
    (m ? primaryOf(e) === m : ex.bp === 'cardio' && e.bp === 'cardio'))
    .map(e => ({ e, s: score(e) }))
    .sort((a, b) => b.s - a.s || a.e.n.length - b.e.n.length || (a.e.n < b.e.n ? -1 : 1))
    .map(x => x.e)
}
