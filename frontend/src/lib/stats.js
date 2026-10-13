// Numbers behind the Stats page — every one of them read over a range the page picks
// (7 = this calendar week, 30/90/365 = the last N days, 0 = all time), so the tiles can't
// disagree about which workouts they are talking about. Pure, like the rest of lib/.
import { isoOf, weekKey } from './format.js'
import { effectiveRoutineId, topSet, isBw } from './history.js'
import { bestSetOf, e1rmSeries } from './onerm.js'

const DAY = 864e5
const at = iso => new Date(iso + 'T12:00:00')
const addDays = (iso, n) => { const d = at(iso); d.setDate(d.getDate() + n); return isoOf(d) }
const span = b => Math.round((at(b.to) - at(b.from)) / DAY) + 1

// The ISO dates [from, to] a range covers, both inclusive. The week is Monday-first and ends
// today, like the week strip on Home; "all" starts at the first workout.
export function rangeBounds(days, today = new Date(), workouts = []) {
  const to = isoOf(today)
  if (days === 7) return { from: addDays(to, -((today.getDay() + 6) % 7)), to }
  if (!days) return { from: (workouts || []).reduce((a, w) => (!a || w.d < a ? w.d : a), null) || to, to }
  return { from: addDays(to, -(days - 1)), to }
}

// The stretch to compare a range with. A week compares with the same weekdays of last week —
// Monday to Wednesday against last Monday to Wednesday — because a half-done week set against
// a whole one always reads as a drop. Every other range compares with the one just before it.
// All time has nothing before it.
export function prevBounds(b, days) {
  if (!days) return null
  const shift = days === 7 ? 7 : span(b)
  return { from: addDays(b.from, -shift), to: addDays(b.to, -shift) }
}

export const inRange = (workouts, b) => (workouts || []).filter(w => w.d >= b.from && w.d <= b.to)
export const volumeOf = ws => ws.reduce((n, w) => n + (w.vol || 0), 0)
// Imported sessions carry no clock — they count as a session but add no time.
export const minutesOf = w => Math.max(0, Math.round(((w.end || w.start || 0) - (w.start || 0)) / 60000))

// Days trained against days the plan asked for, over the range. Planned days before the first
// workout don't count: the plan probably didn't exist yet, and a ring that starts a year in
// debt for a week-old profile says nothing true.
export function adherence(S, b) {
  const ws = S.workouts || []
  const done = new Set(inRange(ws, b).map(w => w.d)).size
  const first = ws.reduce((a, w) => (!a || w.d < a ? w.d : a), null)
  let planned = 0
  if (first) for (let iso = first > b.from ? first : b.from; iso <= b.to; iso = addDays(iso, 1)) if (effectiveRoutineId(S, iso)) planned++
  return { done, planned }
}

// How the mini charts split a range: days for a week, weeks up to a quarter, months beyond.
export const bucketBy = days => (days === 7 ? 'day' : days && days <= 90 ? 'week' : 'month')
const keyOf = (by, iso) => (by === 'day' ? iso : by === 'week' ? weekKey(iso) : iso.slice(0, 7))

// Volume, minutes and sessions per bucket, oldest first. A week shows all seven days, the
// ones still ahead as empty bars, so Wednesday doesn't look like a short week. Months are
// capped at the last two years — past that the bars are too thin to tell apart.
export function buckets(workouts, b, by) {
  const to = by === 'day' ? addDays(b.from, 6) : b.to
  const keys = []
  for (let iso = b.from; iso <= to; iso = addDays(iso, 1)) {
    const k = keyOf(by, iso)
    if (keys[keys.length - 1] !== k) keys.push(k)
  }
  const acc = Object.fromEntries(keys.map(k => [k, { key: k, vol: 0, min: 0, n: 0 }]))
  inRange(workouts, b).forEach(w => {
    const a = acc[keyOf(by, w.d)]
    if (a) { a.vol += w.vol || 0; a.min += minutesOf(w); a.n++ }
  })
  return keys.slice(-24).map(k => acc[k])
}

// Weeks trained, oldest first, ending with the current week — the streak strip.
export function weeksTrained(workouts, n, today = new Date()) {
  const on = new Set((workouts || []).map(w => weekKey(w.d)))
  const end = isoOf(today)
  return Array.from({ length: n }, (_, i) => {
    const wk = weekKey(addDays(end, -7 * (n - 1 - i)))
    return { wk, on: on.has(wk) }
  })
}

// Longest run of trained weeks in a strip.
export const bestRun = weeks => weeks.reduce((a, w) => (w.on ? { cur: a.cur + 1, best: Math.max(a.best, a.cur + 1) } : { cur: 0, best: a.best }), { cur: 0, best: 0 }).best

// Records set in the range, newest first, each with the set it was set with. `w.prs` holds
// load records (history.js isLoadPR); on a bodyweight lift the load is the weight added.
export function personalBests(S, b) {
  const out = []
  inRange(S.workouts, b).forEach(w => (w.prs || []).forEach(id => {
    const e = w.entries.find(x => x.id === id)
    const s = topSet(e)
    if (s) out.push({ id, d: w.d, t: w.start || 0, w: s.w || 0, r: s.r || 0, bw: isBw({ ...(e.target || {}), id }) })
  }))
  return out.sort((x, y) => (x.d === y.d ? y.t - x.t : x.d < y.d ? 1 : -1))
}

// The lift the strength tile follows: the one trained most often in the range that yields an
// estimated 1RM (so not timed holds, cardio or unloaded bodyweight work). Its estimate now,
// and how far it moved since the first session in the range.
export function mainLift(S, b) {
  const n = {}
  inRange(S.workouts, b).forEach(w => w.entries.forEach(e => { if (bestSetOf(e)) n[e.id] = (n[e.id] || 0) + 1 }))
  const id = Object.keys(n).sort((x, y) => n[y] - n[x])[0]
  if (!id) return null
  const pts = e1rmSeries(S, id).filter(p => p.d >= b.from && p.d <= b.to)
  const last = pts[pts.length - 1]
  return { id, pts, now: last.y, delta: pts.length > 1 ? last.y - pts[0].y : null, since: pts[0].d }
}

// The radar's six areas, clockwise from the top. Every muscle the body map draws sits in
// exactly one of them (checked in stats.test.js), so no set is counted twice or dropped.
export const AREAS = [
  ['Chest', ['chest']],
  ['Shoulders', ['deltoids']],
  ['Arms', ['biceps', 'triceps', 'forearm']],
  ['Core', ['abs', 'obliques', 'serratus']],
  ['Legs', ['gluteal', 'quadriceps', 'hamstring', 'adductors', 'hip-flexors', 'calves', 'tibialis']],
  ['Back', ['upper-back', 'trapezius', 'lower-back']],
]
export const areaSets = load => AREAS.map(([area, ms]) => ({ area, sets: ms.reduce((n, m) => n + (load[m] || 0), 0) }))
