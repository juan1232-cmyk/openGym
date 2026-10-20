// One-tap fixes for a lift that's stuck, sliding or flat (Stats → Lifts to watch). stats.js
// liftFixes says what to try;
// this says what accepting each one changes in the plan, makes the change, and can take it
// back. Pure like the rest of lib/: every function either reads S or mutates the draft the
// store's update() hands it, so the debounced sync sees every change.
//
// What was accepted is remembered in S.liftFixes[exId][kind] = { t, d, ...the change }, so
// the card shows it as done instead of suggesting it again — until the lift sets a new
// estimated-1RM best. Then the fix worked, and if the lift goes flat again later that is a
// new stall with its own suggestions.
import { isoOf } from './format.js'
import { best1RM } from './onerm.js'
import { MAX_BW_SETS } from './progression.js'

const DAY = 864e5
// A deload week is a week: today and the six days after it.
export const DELOAD_DAYS = 7
// "Add a set" stops here. Past six sets of one lift in a session, more of the same isn't the
// answer to a stall — the swap or the deload is. Same ceiling bodyweight progression uses.
export const MAX_SETS = MAX_BW_SETS

const setsOf = c => Math.max(1, c.sets || 1)
// Every routine the lift is planned in, once each — a lift can sit in more than one.
const homes = (S, id) => (S.routines || []).filter(r => (r.ex || []).some(c => c.id === id))
const cfgsIn = (S, rid, id) => ((S.routines || []).find(r => r.id === rid)?.ex || []).filter(c => c.id === id)

/**
 * What accepting `fix` (one of stats.js flatFixes) would change, or null when there is nothing
 * it can change — the lift isn't in any routine, the swap found no alternative, a bodyweight
 * lift has no load to deload. A null fix is still advice; it just isn't a button.
 *
 * Add sets is a lasting change, not a one-week bump, on purpose: a stalled lift needs more work
 * for long enough to adapt to it, and a set that silently vanishes next Monday would undo the
 * fix before it had a chance to work. It's one set per session it's planned in — the low end of
 * the 1–2 the advice gives, since the cheapest change goes first and Peek can suggest another.
 * Undo puts it back.
 *
 * The swap is the opposite: one session only. It is a change of scenery for a lift that's
 * gone stale, not a new plan — so the routine keeps the lift and carries a `swap` marker on
 * its entry; the next workout of that routine does the alternative instead (sessionPlan), and
 * finishing it spends the marker (spendSwaps), so the session after has the lift back.
 */
export function fixAction(S, id, fix, now = new Date()) {
  const rs = homes(S, id)
  if (!rs.length || !fix) return null
  const where = r => ({ rid: r.id, name: r.name })
  if (fix.kind === 'sets') {
    const routines = rs.map(r => {
      const from = setsOf(cfgsIn(S, r.id, id)[0])
      return from < MAX_SETS ? { ...where(r), from, to: from + 1 } : null
    }).filter(Boolean)
    return routines.length ? { kind: 'sets', routines } : null
  }
  if (fix.kind === 'swap') {
    if (!fix.alt || fix.alt === id) return null
    // not in a routine that already does the alternative — that session would have it twice
    const routines = rs.filter(r => !r.ex.some(c => c.id === fix.alt)).map(where)
    return routines.length ? { kind: 'swap', from: id, to: fix.alt, routines } : null
  }
  if (fix.kind === 'deload') {
    if (!(fix.weight > 0)) return null
    return { kind: 'deload', w: fix.weight, until: isoOf(new Date(now.getTime() + (DELOAD_DAYS - 1) * DAY)), routines: rs.map(where) }
  }
  return null
}

/** Make the change on a draft of S and remember it. Returns what changed, or null. */
export function applyFix(S, id, fix, now = new Date()) {
  const act = fixAction(S, id, fix, now)
  if (!act) return null
  act.routines.forEach(({ rid }) => cfgsIn(S, rid, id).forEach(c => {
    if (act.kind === 'sets') c.sets = setsOf(c) + 1
    else if (act.kind === 'swap') c.swap = { to: act.to }
    else c.deload = { w: act.w, until: act.until }
  }))
  // markers from an earlier stall of this lift are spent — drop them with this one
  const keep = Object.fromEntries(Object.entries((S.liftFixes || {})[id] || {}).filter(([, m]) => current(S, id, m)))
  S.liftFixes = { ...(S.liftFixes || {}), [id]: { ...keep, [act.kind]: { t: now.getTime(), d: isoOf(now), ...act } } }
  return act
}

/**
 * Take an accepted fix back, on a draft of S. Only what the fix itself changed: a set count
 * edited by hand since then is the lifter's own call and stays. A swap that has already been
 * done can't be taken back — the session happened — so only the marker goes.
 */
export function undoFix(S, id, kind) {
  const m = ((S.liftFixes || {})[id] || {})[kind]
  if (!m) return false
  m.routines.forEach(({ rid, to }) => {
    if (kind === 'sets') cfgsIn(S, rid, id).forEach(c => { if (setsOf(c) === to) c.sets = to - 1 })
    else if (kind === 'swap') cfgsIn(S, rid, id).forEach(c => { delete c.swap })
    else cfgsIn(S, rid, id).forEach(c => { delete c.deload })
  })
  const rest = { ...S.liftFixes[id] }
  delete rest[kind]
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

/** The accepted fix of this kind for this lift, if it still applies — else null. */
export function fixDone(S, id, kind) {
  const m = ((S.liftFixes || {})[id] || {})[kind]
  return m && current(S, id, m) ? m : null
}

/** Whether an accepted swap is still waiting for its session (else it has been done). */
export const swapPending = (S, id) => (S.routines || []).some(r => (r.ex || []).some(c => c.id === id && c.swap))

/**
 * The exercise list the next workout of a routine is built from: the routine's own, with any
 * one-session swap put in place. The stand-in keeps the entry's sets, reps and progression
 * settings, but not a deload week — that weight was worked out for the lift it replaces.
 */
export function sessionPlan(routine) {
  return ((routine && routine.ex) || []).map(c => {
    if (!c.swap) return c
    const { swap, deload, ...rest } = c
    return { ...rest, id: swap.to }
  })
}

/**
 * After a workout is finished, on a draft of S: the swaps it did are spent. Only ones it
 * actually logged a set of — a swapped-in exercise removed mid-session hasn't had its go yet,
 * so the swap waits for the next one.
 */
export function spendSwaps(S, w) {
  const r = (S.routines || []).find(x => x.id === w.routineId)
  if (!r) return
  const did = new Set((w.entries || []).filter(e => (e.sets || []).some(s => s.done)).map(e => e.id))
  r.ex.forEach(c => { if (c.swap && did.has(c.swap.to)) delete c.swap })
}
