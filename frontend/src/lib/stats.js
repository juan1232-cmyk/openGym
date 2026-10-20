// Numbers behind the Stats page — every one of them read over a range the page picks
// (7 = this calendar week, 30/90/365 = the last N days, 0 = all time), so the tiles can't
// disagree about which workouts they are talking about. Pure, like the rest of lib/.
import { isoOf, weekKey } from './format.js'
import { effectiveRoutineId, topSet, isBw } from './history.js'
import { bestSetOf, e1rmSeries } from './onerm.js'
import { liftTrend, liftStalls, STALL_SESSIONS, RECENT_DAYS } from './verdict.js'
import { trendPer14 } from './progress.js'
import { deloadTo, defaultIncrement, DELOAD_FACTOR } from './progression.js'
import { similarTo, usageOf } from './pick.js'
import { EXIDX, allExercises } from './exercises.js'
import { isCompound } from './scheme.js'
import { WEEKLY_ZONES, WEEK_GOAL, HEAVY_REPS, MAIN_LIFT_FREQ, MAIN_LIFT_T } from './engine-config.js'
import { loadOfWorkouts } from './muscles.js'
import { ratingOf } from './ratings.js'

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

// A lift is flat once this many sessions in a row have failed to set a new estimated-1RM best.
// e1RM rather than the target, so it catches what "stuck" can't: a lift that hits its reps
// every time and still isn't getting any stronger, or one with no plan to miss at all.
export const FLAT_SESSIONS = 3

// Sessions since the exercise last set a new e1RM best — matching the best is not beating it.
// Null with no estimate at all. The first session is a best by definition, so it is only after
// it that anything can come up short.
export function sessionsSinceBest(S, exId) {
  let best = -Infinity, since = null
  e1rmSeries(S, exId).forEach(p => { if (p.y > best) { best = p.y; since = 0 } else since++ })
  return since
}

// What to do about a lift on the list, in the order to try it — and the order depends on what
// is wrong. Flat (hitting its reps, just not getting stronger): the weight is fine and the
// stimulus isn't, so more work on it first (the cheapest change, and often all it needed),
// then a different movement for a session, and only then a lighter week — a deload costs a
// week of training, so it is the last thing to spend there. Stuck (missing the target session
// after session) or sliding (the estimate falling): the weight is beating you, or tiredness
// is. More sets of a weight you can't finish only dig the hole deeper, so a deload week leads
// and adding sets isn't offered at all; the swap is the change of scenery after it.
function fixesFor(S, id, cfg, planned, kind) {
  const all = allExercises(S)
  const ex = all.find(e => e.id === id)
  const alt = ex ? similarTo(ex, all, { exclude: [...planned], gymEq: S.gymEq, usage: usageOf(S) })[0] : null
  const last = [...(S.workouts || [])].reverse().map(w => w.entries.find(e => e.id === id)).find(e => e && e.sets.some(s => s.done))
  const w = Math.max(0, ...((last && last.sets) || []).filter(s => s.done).map(s => s.w || 0))
  const inc = cfg && cfg.inc > 0 ? cfg.inc : defaultIncrement(id, S.unit || 'kg')
  const sets = { kind: 'sets', add: [1, 2] }
  const swap = { kind: 'swap', alt: alt ? alt.id : null }
  const deload = { kind: 'deload', factor: DELOAD_FACTOR, weight: w > 0 ? deloadTo(w, inc) : null }
  return kind === 'flat' ? [sets, swap, deload] : [deload, swap]
}

// Lifts worth a look right now: planned lifts stuck on their target (the same stall count the
// orb's "Stalled" verdict uses), then lifts whose estimated 1RM is trending down, then lifts
// that have gone FLAT_SESSIONS without a new e1RM best. Stuck comes first because it already
// says what's wrong; a falling trend only says that something is. One entry per lift: a flat
// lift that is also stuck or falling stays under that heading (with `flat` set). Every entry
// carries its fixes (fixesFor), ordered for the heading it's under.
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
  const byId = new Map(out.map(x => [x.id, x]))
  const today = at(isoOf(now))
  recent.forEach(id => {
    const since = sessionsSinceBest(S, id)
    if (since == null || since < FLAT_SESSIONS) return
    // the same "still trained" window the orb uses — a lift dropped a month ago isn't flat
    const pts = e1rmSeries(S, id)
    if ((today - at(pts[pts.length - 1].d)) / DAY > RECENT_DAYS) return
    const x = byId.get(id)
    if (x) x.flat = since
    else out.push({ id, kind: 'flat', n: since })
  })
  out.forEach(x => { x.fixes = fixesFor(S, x.id, planned.get(x.id), planned.keys(), x.kind) })
  const RANK = { stuck: 0, down: 1, flat: 2 }
  return out.sort((a, b) => (a.kind === b.kind ? (a.kind === 'down' ? a.rate - b.rate : b.n - a.n) : RANK[a.kind] - RANK[b.kind]))
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

// This week's effective sets against the goal (engine-config WEEK_GOAL), for the big muscles you
// actually train: any exercised directly (as an exercise's main muscle) this week or in the three
// weeks before. A shoulder that only ever helped on bench isn't a shoulder day, and a muscle you
// dropped a month ago doesn't nag every Monday; the Stats page's zones still show what you never
// hit. The sets that count toward the goal are all of them, incidental credit included.
// `behind` is the muscles short of the goal, furthest first. `daysLeft` counts the days after
// today, so Sunday is 0.
export function weekGoals(workouts, now = new Date()) {
  const week = rangeBounds(7, now)
  const lately = { from: addDays(week.from, -21), to: week.to }
  const thisWeek = loadOfWorkouts(inRange(workouts, week))
  const direct = loadOfWorkouts(inRange(workouts, lately), undefined, 1)
  const rows = MAJOR.filter(m => direct[m] > 0).map(m => {
    const done = thisWeek[m] || 0
    return { m, done, goal: WEEK_GOAL, short: Math.max(0, WEEK_GOAL - done) }
  })
  const behind = rows.filter(r => r.short > 0).sort((a, b) => b.short - a.short)
  return { rows, behind, met: rows.length > 0 && !behind.length, daysLeft: 6 - ((now.getDay() + 6) % 7) }
}

// The strength side of the week: for each main lift trained lately, how many sessions this
// calendar week had it and how many of its sets were heavy (HEAVY_REPS or fewer). A main lift
// trained fewer than MAIN_LIFT_FREQ times this week is flagged — once a week holds strength,
// twice is what moves it. "Lately" is the last four weeks, so a lift you dropped a month ago
// doesn't nag every Monday.
// A main lift is a rated lift with strength transfer T of at least MAIN_LIFT_T (layer 1, ratings.js).
// T belongs to the exercise, not to a muscle, so any target's rating will do. An exercise with no
// rating (a stretch, a drill, a custom lift, or the table not loaded yet) falls back to "is it a
// compound", so a deadlift never drops out of the list just because nobody rated it.
export const isMainLift = id => { const r = ratingOf(id); return r ? r.T >= MAIN_LIFT_T : isCompound(EXIDX[id]) }
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
