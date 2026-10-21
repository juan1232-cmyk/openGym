// One-tap fixes for a lift that's stuck, sliding or flat (Stats → Lifts to watch). stats.js
// fixesFor says what to try, in order; this says what each one would change in the plan, makes
// the change, and can take it back. Pure like the rest of lib/: every function either reads S
// or mutates the draft the store's update() hands it, so the debounced sync sees every change.
//
// What was accepted is remembered in S.liftFixes[exId][kind] = { t, d, ...the change }, so the
// card shows it as done and Peek moves on to its next idea — until the lift sets a new
// estimated-1RM best. Then the fix worked, and if the lift stalls again later that is a new
// stall with every idea back on the table. The swap is the exception: it is done only while
// its week lasts, then Peek may suggest the next variant (see fixAction).
import { isoOf } from './format.js'
import { best1RM } from './onerm.js'
import { modeOf } from './history.js'
import { MAX_BW_SETS, policyFor, defaultIncrement } from './progression.js'

const DAY = 864e5
const addDays = (iso, n) => isoOf(new Date(new Date(iso + 'T12:00:00').getTime() + n * DAY))
// A deload week, and a swap's week on the variant: today (or the first session) and six more.
export const WEEK_DAYS = 7
// "Add a set" stops here. Past six sets of one lift in a session, more of the same isn't the
// answer to a stall — the swap or the deload is. Same ceiling bodyweight progression uses.
export const MAX_SETS = MAX_BW_SETS
// The smallest jump "smaller steps" goes down to — the smallest pair of plates most gyms have.
export const MIN_STEP = { kg: 1.25, lb: 2.5 }
// Double progression's range when a lift is switched to it: from its reps now, up this many.
export const DOUBLE_SPAN = 3

const setsOf = c => Math.max(1, c.sets || 1)
// Every routine the lift is planned in, once each — a lift can sit in more than one.
const homes = (S, id) => (S.routines || []).filter(r => (r.ex || []).some(c => c.id === id))
const cfgsIn = (S, rid, id) => ((S.routines || []).find(r => r.id === rid)?.ex || []).filter(c => c.id === id)
const marker = (S, id, kind) => ((S.liftFixes || {})[id] || {})[kind]
// the step a weighted lift goes up by, and the policies that step at all
const stepOf = (S, c) => (c.inc > 0 ? c.inc : defaultIncrement(c.id, S.unit || 'kg'))
const STEPPING = ['linear', 'greyskull', 'double']

/**
 * What accepting `fix` (one of stats.js fixesFor) would change, or null when it can't be done
 * to this lift's plan — it isn't in any routine, it's bodyweight (no load to deload or step),
 * it's already on the smallest step or on double progression, no variant is left to try.
 *
 * Add a set is a lasting change, not a one-week bump, on purpose: a stalled lift needs more
 * work for long enough to adapt to it, and a set that silently vanished next Monday would undo
 * the fix before it had a chance to work. One per session it's planned in — the low end of the
 * 1–2 the advice gives. Smaller steps and double progression are lasting too, for the same
 * reason. Undo puts any of them back.
 *
 * The swap is the opposite: a week on a variant, then back. A change of scenery for a lift
 * that's gone stale, not a new plan — so the routine keeps the lift and its entry carries a
 * `swap` marker; sessionPlan does the variant in its place from the next session until a week
 * after that first session (whatever the training frequency: "week 2 the variant, week 3 the
 * lift again"), and spendSwaps starts and ends that week. If the lift is still stuck after,
 * Peek offers the next variant: one not tried yet during this stall.
 */
export function fixAction(S, id, fix, now = new Date()) {
  const rs = homes(S, id)
  if (!rs.length || !fix) return null
  const where = r => ({ rid: r.id, name: r.name })
  const first = r => cfgsIn(S, r.id, id)[0]
  const unit = S.unit || 'kg'
  if (fix.kind === 'sets') {
    const routines = rs.map(r => {
      const from = setsOf(first(r))
      return from < MAX_SETS ? { ...where(r), from, to: from + 1 } : null
    }).filter(Boolean)
    return routines.length ? { kind: 'sets', routines } : null
  }
  if (fix.kind === 'steps') {
    if (!(fix.w > 0)) return null
    const routines = rs.map(r => {
      const c = first(r)
      if (modeOf(c) !== 'reps' || !STEPPING.includes(policyFor(c, r))) return null
      const from = stepOf(S, c), to = Math.round(from / 2 * 100) / 100
      return to >= MIN_STEP[unit] ? { ...where(r), from, to, had: c.inc } : null
    }).filter(Boolean)
    return routines.length ? { kind: 'steps', routines } : null
  }
  if (fix.kind === 'double') {
    if (!(fix.w > 0)) return null
    const routines = rs.map(r => {
      const c = first(r)
      if (modeOf(c) !== 'reps' || !['linear', 'greyskull'].includes(policyFor(c, r))) return null
      const low = Math.max(1, c.reps || 5)
      return { ...where(r), low, high: low + DOUBLE_SPAN, had: { prog: c.prog, reps: c.reps, repsMin: c.repsMin } }
    }).filter(Boolean)
    return routines.length ? { kind: 'double', routines } : null
  }
  if (fix.kind === 'swap') {
    const m = marker(S, id, 'swap')
    const tried = (m && current(S, id, m) && m.tried) || []
    const to = (fix.alts || [fix.alt]).find(a => a && a !== id && !tried.includes(a))
    if (!to) return null
    // not in a routine that already does the variant — that session would have it twice
    const routines = rs.filter(r => !r.ex.some(c => c.id === to)).map(where)
    return routines.length ? { kind: 'swap', from: id, to, tried: [...tried, to], routines } : null
  }
  if (fix.kind === 'deload') {
    if (!(fix.weight > 0)) return null
    return { kind: 'deload', w: fix.weight, until: addDays(isoOf(now), WEEK_DAYS - 1), routines: rs.map(where) }
  }
  return null
}

/** Make the change on a draft of S and remember it. Returns what changed, or null. */
export function applyFix(S, id, fix, now = new Date()) {
  const act = fixAction(S, id, fix, now)
  if (!act) return null
  act.routines.forEach(x => cfgsIn(S, x.rid, id).forEach(c => {
    if (act.kind === 'sets') c.sets = setsOf(c) + 1
    else if (act.kind === 'steps') c.inc = x.to
    else if (act.kind === 'double') Object.assign(c, { prog: 'double', repsMin: x.low, reps: x.high })
    else if (act.kind === 'swap') c.swap = { to: act.to }
    else c.deload = { w: act.w, until: act.until }
  }))
  // markers from an earlier stall of this lift are spent — drop them with this one
  const keep = Object.fromEntries(Object.entries((S.liftFixes || {})[id] || {}).filter(([, m]) => current(S, id, m)))
  S.liftFixes = { ...(S.liftFixes || {}), [id]: { ...keep, [act.kind]: { t: now.getTime(), d: isoOf(now), ...act } } }
  return act
}

/**
 * Take an accepted fix back, on a draft of S. Only what the fix itself changed: a setting
 * edited by hand since then is the lifter's own call and stays.
 */
export function undoFix(S, id, kind) {
  const m = marker(S, id, kind)
  if (!m) return false
  m.routines.forEach(x => cfgsIn(S, x.rid, id).forEach(c => {
    if (kind === 'sets') { if (setsOf(c) === x.to) c.sets = x.to - 1 }
    else if (kind === 'steps') { if (c.inc === x.to) { if (x.had > 0) c.inc = x.had; else delete c.inc } }
    else if (kind === 'double') {
      if (c.prog === 'double' && c.reps === x.high) ['prog', 'reps', 'repsMin'].forEach(k => { if (x.had[k] == null) delete c[k]; else c[k] = x.had[k] })
    }
    else if (kind === 'swap') delete c.swap
    else delete c.deload
  }))
  const rest = { ...S.liftFixes[id] }
  // an undone swap was never tried; the variants before it were, and stay off the list
  if (kind === 'swap' && m.tried.length > 1) rest.swap = { ...m, tried: m.tried.slice(0, -1), undone: true }
  else delete rest[kind]
  if (Object.keys(rest).length) S.liftFixes[id] = rest
  else delete S.liftFixes[id]
  return true
}

// Still about the stall it was accepted for: no new estimated-1RM best since. Timestamps when
// both sides have them (a best set later the same day counts), dates for imported sessions.
function current(S, id, m) {
  const best = best1RM(S, id)
  if (!best) return true
  return best.t && m.t ? best.t <= m.t : best.d <= m.d
}

// A swap marker on a routine entry is live until a week after the first session that did it.
const swapLive = (c, today) => !!c.swap && (!c.swap.until || today <= c.swap.until)

/** Whether a swap for this lift is waiting for, or in, its week on the variant. */
export const swapPending = (S, id, now = new Date()) =>
  (S.routines || []).some(r => (r.ex || []).some(c => c.id === id && swapLive(c, isoOf(now))))

/** The accepted fix of this kind for this lift, if it still applies — else null. */
export function fixDone(S, id, kind, now = new Date()) {
  const m = marker(S, id, kind)
  if (!m || m.undone || !current(S, id, m)) return null
  return kind === 'swap' && !swapPending(S, id, now) ? null : m
}

/**
 * The exercise list the next workout of a routine is built from: the routine's own, with a
 * swap in its week put in place. The stand-in keeps the entry's sets, reps and progression
 * settings, but not a deload week — that weight was worked out for the lift it replaces.
 */
export function sessionPlan(routine, now = new Date()) {
  const today = isoOf(now)
  return ((routine && routine.ex) || []).map(c => {
    if (!swapLive(c, today)) return c
    const { swap, deload, ...rest } = c
    return { ...rest, id: swap.to }
  })
}

/**
 * After a workout is finished, on a draft of S: the first session that did a swap's variant
 * starts its week, and a swap whose week is over is cleared, so the lift is back. Only a
 * variant it actually logged a set of counts — one removed mid-session hasn't had its go yet.
 */
export function spendSwaps(S, w) {
  const r = (S.routines || []).find(x => x.id === w.routineId)
  if (!r) return
  const did = new Set((w.entries || []).filter(e => (e.sets || []).some(s => s.done)).map(e => e.id))
  r.ex.forEach(c => {
    if (!c.swap) return
    if (c.swap.until && w.d > c.swap.until) delete c.swap
    else if (!c.swap.until && did.has(c.swap.to)) c.swap.until = addDays(w.d, WEEK_DAYS - 1)
  })
}
