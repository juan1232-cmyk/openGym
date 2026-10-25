// What to do about the week, for the action version of Stats. stats.js says how the numbers
// stand; this turns what is wrong into a change that can be made in one tap and taken back —
// the same shape as liftfix.js, which does it for a stuck lift. Pure: every function reads S or
// mutates the draft the store's update() hands it, so the debounced sync sees every change.
//
// Three kinds of change live here, each aimed at something the plan can still fix this week:
//   muscle — a muscle the rest of the week's plan leaves short of its sets: add an exercise to the
//            day that is coming up (the numbers can't say "you're behind" on a Monday, but the
//            plan can say "you'll end the week behind")
//   day    — a planned weekday that keeps getting skipped: move that session to a day you do train
//   weigh  — a weigh-in that has gone stale, which the weight pace and the goal date are built on
// Stuck lifts are liftfix.js's, and come through here only so one list can rank them all.
import { isoOf } from './format.js'
import { rangeBounds, inRange, weekGoals, weekdayPattern, liftsToWatch, PATTERN_MIN_DAYS } from './stats.js'
import { loadOfRoutine } from './muscles.js'
import { effectiveRoutine, lastBW, streakWeeks } from './history.js'
import { allExercises } from './exercises.js'
import { exerciseForMuscle, quickConfig, usageOf } from './pick.js'
import { scoreOf } from './score.js'
import { targetFor } from './ratings.js'

const DAY = 864e5
const at = iso => new Date(iso + 'T12:00:00')
const addDays = (iso, n) => isoOf(new Date(at(iso).getTime() + n * DAY))
// "Add N sets" stops here: more than this of one exercise in a day is a different problem
export const MAX_ADD_SETS = 4
// A weigh-in older than this makes the pace and the goal date a guess
export const STALE_WEIGH_DAYS = 7
// Most things on the list at once — a to-do list of eight is a list nobody does
export const MAX_ITEMS = 4

/**
 * The calendar week from today: sessions done, and the planned days still ahead (today
 * included until something is logged on it).
 */
export function weekAhead(S, now = new Date()) {
  const week = rangeBounds(7, now)       // Monday to today
  const sunday = addDays(week.from, 6)
  const today = isoOf(now)
  const ws = S.workouts || []
  const done = new Set(inRange(ws, week).map(w => w.d)).size
  const left = []
  for (let iso = ws.some(w => w.d === today) ? addDays(today, 1) : today; iso <= sunday; iso = addDays(iso, 1)) {
    const routine = effectiveRoutine(S, iso)
    if (routine) left.push({ iso, routine })
  }
  return { week, today, done, left, planned: done + left.length }
}

/**
 * The big muscles you train that the rest of the plan leaves short of the week's goal: sets
 * done so far plus what the days still planned will give. `short` is whole sets, furthest
 * behind first. Nothing once no planned day is left to add them to.
 */
export function muscleGaps(S, now = new Date()) {
  const { left } = weekAhead(S, now)
  if (!left.length) return []
  const coming = {}
  left.forEach(l => { const ld = loadOfRoutine(l.routine); for (const m in ld) coming[m] = (coming[m] || 0) + ld[m] })
  return weekGoals(S.workouts, now).rows
    .map(r => ({ m: r.m, done: r.done, projected: r.done + (coming[r.m] || 0), goal: r.goal }))
    .map(g => ({ ...g, short: Math.ceil(g.goal - g.projected - 1e-9) }))
    .filter(g => g.short >= 1)
    .sort((a, b) => b.short - a.short)
}

/**
 * What adding sets for a muscle in `gap` (one of muscleGaps) would change, or null when it
 * can't be done: no coming day that already works the muscle, or no exercise for it that the
 * gym has. It goes in the coming day that works the muscle hardest — the leg day, not the pull
 * day — as an exercise the person already uses if there is one. A day that doesn't touch the
 * muscle at all is never the answer: bench press on a Friday leg day is a worse plan than
 * leaving the gap, so with only that day left there is nothing to suggest.
 */
export function muscleAction(S, gap, now = new Date()) {
  const { left } = weekAhead(S, now)
  const target = left.map((l, i) => ({ l, i, w: loadOfRoutine(l.routine)[gap.m] || 0 }))
    .filter(x => x.w > 0)
    .sort((a, b) => b.w - a.w || a.i - b.i)[0]
  if (!target) return null
  const r = target.l.routine
  // Peek's score for the exercise as a work-out for this muscle; unrated until the table loads
  const score = e => { const s = scoreOf(e.id, null, targetFor(e.id, gap.m)); return s ? s.base : null }
  const ex = exerciseForMuscle(gap.m, r.ex, allExercises(S), { gymEq: S.gymEq, usage: usageOf(S), score })
  if (!ex) return null
  return { kind: 'muscle', m: gap.m, short: gap.short, ex: ex.id, sets: Math.min(MAX_ADD_SETS, gap.short), rid: r.id, routine: r.name, iso: target.l.iso }
}

/** Make the change on a draft of S. Returns what changed, or null. */
export function applyMuscle(S, act) {
  const r = (S.routines || []).find(x => x.id === act.rid)
  const ex = allExercises(S).find(e => e.id === act.ex)
  if (!r || !ex || r.ex.some(c => c.id === act.ex)) return null
  r.ex.push({ id: act.ex, ...quickConfig(ex, S, act.rid), sets: act.sets })
  return act
}

/** Take it back: only the entry it added, and only while its sets are still what it set. */
export function undoMuscle(S, act) {
  const r = (S.routines || []).find(x => x.id === act.rid)
  const i = r ? r.ex.findIndex(c => c.id === act.ex && c.sets === act.sets) : -1
  if (i < 0) return false
  r.ex.splice(i, 1)
  return true
}

/**
 * A planned weekday that keeps getting skipped (stats.js weekdayPattern), and where its
 * session could go instead: a free weekday you already train on (the most, over the same
 * stretch), else the nearest free one. Weekdays Monday-first, as weekdayPattern has them;
 * S.week itself is keyed by Date.getDay(). Null when nothing is skipped or no day is free.
 */
export function dayAction(S, now = new Date()) {
  const { worst } = weekdayPattern(S, rangeBounds(PATTERN_MIN_DAYS, now), now)
  if (!worst) return null
  const js = wd => (wd + 1) % 7
  const week = S.week || {}
  const rid = week[js(worst.wd)]
  const routine = (S.routines || []).find(r => r.id === rid)
  if (!routine) return null
  const from = addDays(isoOf(now), -(PATTERN_MIN_DAYS - 1))
  const extra = Array(7).fill(0)
  ;(S.workouts || []).forEach(w => { if (w.d >= from && !week[at(w.d).getDay()]) extra[(at(w.d).getDay() + 6) % 7]++ })
  const free = [0, 1, 2, 3, 4, 5, 6].filter(wd => !week[js(wd)])
  if (!free.length) return null
  const near = wd => Math.min((wd - worst.wd + 7) % 7, (worst.wd - wd + 7) % 7)
  // a day that sits next to another session is a worse home than one with a rest day around it
  const crowd = wd => [(wd + 6) % 7, (wd + 1) % 7].filter(n => n !== worst.wd && week[js(n)]).length
  const to = free.sort((a, b) => extra[b] - extra[a] || crowd(a) - crowd(b) || near(a) - near(b) || a - b)[0]
  return { kind: 'day', from: worst.wd, to, rid, routine: routine.name, missed: worst.planned - worst.done, planned: worst.planned, often: extra[to] }
}

export function applyDay(S, act) {
  const js = wd => (wd + 1) % 7
  if (S.week[js(act.from)] !== act.rid || S.week[js(act.to)]) return null
  S.week[js(act.to)] = act.rid
  delete S.week[js(act.from)]
  return act
}

export function undoDay(S, act) {
  const js = wd => (wd + 1) % 7
  if (S.week[js(act.to)] !== act.rid || S.week[js(act.from)]) return false
  S.week[js(act.from)] = act.rid
  delete S.week[js(act.to)]
  return true
}

/** A weigh-in gone stale, with a goal or past weigh-ins to keep honest — else null. */
export function weighAction(S, now = new Date()) {
  const last = lastBW(S)
  if (!last && !S.targetW) return null
  const days = last ? Math.round((at(isoOf(now)) - at(last.d)) / DAY) : null
  return days == null || days >= STALE_WEIGH_DAYS ? { kind: 'weigh', days } : null
}

/**
 * The page: where the week stands (`hero`: sessions done of planned, the streak, what is next,
 * and whether the streak is at risk) and what is worth doing about it, most important first —
 * stalled lifts, then muscles the plan leaves short, then the skipped day, then the weigh-in.
 * `more` counts what didn't fit.
 */
export function weekActions(S, now = new Date()) {
  const ahead = weekAhead(S, now)
  const streak = streakWeeks(S, now)
  const next = ahead.left[0] || null
  const hero = {
    done: ahead.done, planned: ahead.planned, streak,
    next: next && { iso: next.iso, today: next.iso === ahead.today, routine: next.routine },
    risk: streak > 0 && ahead.done === 0 && ahead.left.length > 0
  }
  const all = []
  liftsToWatch(S, now).filter(x => x.fixes.length).slice(0, 2).forEach(x => all.push({ key: 'lift:' + x.id, kind: 'lift', x }))
  muscleGaps(S, now).map(g => ({ g, act: muscleAction(S, g, now) })).filter(i => i.act).slice(0, 2)
    .forEach(({ g, act }) => all.push({ key: 'muscle:' + g.m, kind: 'muscle', gap: g, act }))
  const day = dayAction(S, now)
  if (day) all.push({ key: 'day', kind: 'day', act: day })
  const weigh = weighAction(S, now)
  if (weigh) all.push({ key: 'weigh', kind: 'weigh', act: weigh })
  return { hero, items: all.slice(0, MAX_ITEMS), more: Math.max(0, all.length - MAX_ITEMS) }
}
