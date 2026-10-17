// Numbers behind the Stats page — every one of them read over a range the page picks
// (7 = this calendar week, 30/90/365 = the last N days, 0 = all time), so the tiles can't
// disagree about which workouts they are talking about. Pure, like the rest of lib/.
import { isoOf, weekKey } from './format.js'
import { effectiveRoutineId, topSet, isBw } from './history.js'
import { bestSetOf, e1rmSeries } from './onerm.js'
import { liftTrend, liftStalls, STALL_SESSIONS } from './verdict.js'
import { trendPer14 } from './progress.js'
import { EXIDX } from './exercises.js'
import { isCompound } from './scheme.js'
import { WEEKLY_ZONES, HEAVY_REPS, MAIN_LIFT_FREQ, MAIN_LIFT_T } from './engine-config.js'
import { RATING_OF } from './ratings.js'

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

// ---- what to act on --------------------------------------------------------------------

// Lifts worth a look right now: planned lifts stuck on their target (the same stall count the
// orb's "Stalled" verdict uses), then lifts whose estimated 1RM is trending down. Stuck comes
// first because it already says what's wrong; a falling trend only says that something is.
// Not range-bound on purpose — "is this lift stuck" is a question about today.
export function liftsToWatch(S, now = new Date()) {
  const planned = new Map()
  ;(S.routines || []).forEach(r => (r.ex || []).forEach(c => { if (!planned.has(c.id)) planned.set(c.id, c) }))
  const out = []
  planned.forEach((cfg, id) => {
    const n = liftStalls(S, cfg, now)
    if (n >= STALL_SESSIONS) out.push({ id, kind: 'stuck', n })
  })
  const seen = new Set(out.map(x => x.id))
  const recent = new Set((S.workouts || []).slice(-12).flatMap(w => w.entries.map(e => e.id)))
  recent.forEach(id => {
    if (seen.has(id)) return
    const tr = liftTrend(S, id, now)
    if (tr && tr.dir === 'down') out.push({ id, kind: 'down', rate: tr.rate })
  })
  return out.sort((a, b) => (a.kind === b.kind ? (a.kind === 'stuck' ? b.n - a.n : a.rate - b.rate) : a.kind === 'stuck' ? -1 : 1))
}

// Only the big muscle groups are held to the weekly zones — nobody programs 6 weekly sets for
// the shins, and a page that flags them as "too little" every week teaches you to ignore it.
export const MAJOR = ['chest', 'upper-back', 'deltoids', 'biceps', 'triceps', 'quadriceps', 'hamstring', 'gluteal', 'calves', 'abs']

// Effective sets per muscle per week over the range. A part-done current week counts as one
// week, so midweek it reads as "so far" rather than being scaled up into a guess.
export function weeklySets(load, b) {
  const weeks = Math.max(1, span(b) / 7)
  return Object.fromEntries(Object.entries(load).map(([m, v]) => [m, v / weeks]))
}

// Which of the four weekly zones (engine-config WEEKLY_ZONES) a muscle's effective sets fall
// in. Each line belongs to the zone above it, so exactly 10 is already productive and exactly
// 20 still is — past 20 is where extra sets start to buy mostly tiredness.
export const ZONES = ['under', 'ok', 'productive', 'over']
export function setZone(perWeek) {
  const [low, ok, high] = WEEKLY_ZONES
  const v = perWeek || 0
  return v < low ? 'under' : v < ok ? 'ok' : v <= high ? 'productive' : 'over'
}

// The strength side of the week: for each main lift trained lately, how many sessions this
// calendar week had it and how many of its sets were heavy (HEAVY_REPS or fewer). A main lift
// trained fewer than MAIN_LIFT_FREQ times this week is flagged — once a week holds strength,
// twice is what moves it. "Lately" is the last four weeks, so a lift you dropped a month ago
// doesn't nag every Monday.
// A main lift is a rated lift with strength transfer T of at least MAIN_LIFT_T (layer 1, ratings.js).
// Only 19 lifts are rated, so an unrated one falls back to "is it a compound". Without that,
// a deadlift or an overhead press would never count just because nobody has rated it yet.
export const isMainLift = id => (RATING_OF[id] ? RATING_OF[id].T >= MAIN_LIFT_T : isCompound(EXIDX[id]))
export function mainLiftsWeek(workouts, now = new Date()) {
  const week = rangeBounds(7, now)
  const lately = { from: addDays(week.to, -27), to: week.to }
  const out = new Map()
  inRange(workouts, lately).forEach(w => (w.entries || []).forEach(e => {
    if (!isMainLift(e.id)) return
    const done = (e.sets || []).filter(s => s.done)
    if (!done.length) return
    let x = out.get(e.id)
    if (!x) out.set(e.id, x = { id: e.id, sessions: 0, heavy: 0 })
    if (w.d < week.from || w.d > week.to) return
    x.sessions++
    x.heavy += done.filter(s => s.r > 0 && s.r <= HEAVY_REPS).length
  }))
  return [...out.values()]
    .map(x => ({ ...x, few: x.sessions < MAIN_LIFT_FREQ }))
    .sort((a, b) => b.heavy - a.heavy || b.sessions - a.sessions)
}

// Body-weight pace from the last four weeks of weigh-ins (the same best-fit line the lift
// trends use, so one salty dinner doesn't swing it), and — when there's a goal and the pace
// is heading toward it — about when it lands. Null pace until there's enough to fit a line.
export const PACE_DAYS = 28
export function bwPace(bodyweight, targetW, now = new Date()) {
  const from = now.getTime() - PACE_DAYS * DAY
  const pts = (bodyweight || [])
    .map(x => ({ t: x.t || at(x.d).getTime(), y: x.w }))
    .filter(p => p.t >= from && p.t <= now.getTime())
  const r = trendPer14(pts)
  if (r == null) return null
  const perWeek = r / 2
  const cur = pts[pts.length - 1].y
  if (!targetW || Math.abs(targetW - cur) < 0.05) return { perWeek, dir: targetW ? 'reached' : null, eta: null }
  if (Math.abs(perWeek) < 0.05) return { perWeek, dir: 'flat', eta: null }
  if (Math.sign(targetW - cur) !== Math.sign(perWeek)) return { perWeek, dir: 'away', eta: null }
  const weeks = Math.abs(targetW - cur) / Math.abs(perWeek)
  // past a year out the line says more about noise than about a date
  return { perWeek, dir: 'toward', eta: weeks <= 52 ? isoOf(new Date(now.getTime() + weeks * 7 * DAY)) : null }
}

// Planned days trained, per weekday (Monday first), over the range — never less than the last
// eight weeks, since one week holds a single sample per weekday and calls nothing a habit.
// A planned day counts as done only if something was logged that day. Today is left out:
// it isn't missed yet.
export const PATTERN_MIN_DAYS = 56
export function weekdayPattern(S, b, now = new Date()) {
  const ws = S.workouts || []
  const first = ws.reduce((a, w) => (!a || w.d < a ? w.d : a), null)
  const days = Array.from({ length: 7 }, (_, i) => ({ wd: i, planned: 0, done: 0 }))
  if (!first) return { days, worst: null }
  const minFrom = addDays(isoOf(now), -(PATTERN_MIN_DAYS - 1))
  let from = b.from < minFrom ? b.from : minFrom
  if (first > from) from = first
  const trained = new Set(ws.map(w => w.d))
  const today = isoOf(now)
  for (let iso = from; iso < today; iso = addDays(iso, 1)) {
    if (!effectiveRoutineId(S, iso)) continue
    const d = days[(at(iso).getDay() + 6) % 7]
    d.planned++
    if (trained.has(iso)) d.done++
  }
  // the most-missed weekday, only when it's a pattern: missed at least twice and at least half
  // the time it was planned. A tie on misses goes to the day missed more of the time.
  const worst = days.filter(d => d.planned - d.done >= 2 && (d.planned - d.done) / d.planned >= 0.5)
    .sort((a, c) => (c.planned - c.done) - (a.planned - a.done) || (c.planned - c.done) / c.planned - (a.planned - a.done) / a.planned)[0] || null
  return { days, worst }
}
