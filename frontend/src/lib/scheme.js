// Sets and rep ranges for a planned exercise: the one-tap choices the routine editor offers,
// how a range maps onto the fields progression already reads, and what Peek suggests for a
// goal. Pure — the pickers in components/Scheme.jsx only render what comes out of here.
import { isBw, isPerSide, modeOf, repRangeOf } from './history.js'

export const SET_CHOICES = [1, 2, 3, 4, 5, 6]
// [lo, hi] — a single number is a range of one.
// Every suggestion below is one of these, so a suggested plan always shows as a chip.
export const REP_CHOICES = [[5, 5], [6, 8], [8, 12], [10, 15], [12, 15], [15, 20]]

const even = n => Math.ceil(n / 2) * 2

/**
 * A copy of `cfg` aiming for `lo`–`hi` reps, written into the fields progression already
 * understands (see repRangeOf): a loaded lift gets double progression between the two, a
 * bodyweight one climbs from `lo` to the `hi` ceiling. A single number is just `reps`, and
 * drops a double progression that would have nothing to climb between.
 */
export function withRepRange(cfg, lo, hi) {
  let a = Math.max(1, Math.round(Math.min(lo, hi))), b = Math.max(1, Math.round(Math.max(lo, hi)))
  // Unilateral totals stay even, or one side gets a rep the other doesn't (issue #31).
  if (isPerSide(cfg)) { a = even(a); b = even(b) }
  const out = { ...cfg }
  delete out.repsMin
  delete out.repsMax
  if (a === b) {
    out.reps = a
    if (out.prog === 'double') delete out.prog
  } else if (isBw(cfg) && !(cfg.weight > 0)) {
    out.reps = a
    out.repsMax = b
  } else {
    out.reps = b
    out.repsMin = a
    out.prog = 'double'
  }
  return out
}

// Lifts that move several joints and carry the most load — they get the lower reps.
const COMPOUND = /press|squat|deadlift|\brow\b|pull ?up|chin ?up|\bdips?\b|lunge|clean|thrust|push ?up|good morning|step ?up/
export const isCompound = ex => !!ex && !/calf|wrist|finger/.test(norm(ex.n)) && COMPOUND.test(norm(ex.n))
const norm = s => String(s || '').toLowerCase().replace(/-/g, ' ')

// [big lifts, everything else] per goal, as { sets, lo, hi }.
const BY_GOAL = {
  muscle: [{ sets: 3, lo: 6, hi: 8 }, { sets: 3, lo: 10, hi: 15 }],
  strength: [{ sets: 5, lo: 5, hi: 5 }, { sets: 3, lo: 8, hi: 12 }],
  fat: [{ sets: 3, lo: 8, hi: 12 }, { sets: 3, lo: 12, hi: 15 }],
}
const GENERAL = [{ sets: 3, lo: 8, hi: 12 }, { sets: 3, lo: 8, hi: 12 }]

/** What Peek suggests for `ex` under a goal, or null where reps don't apply (cardio, holds). */
export function suggestScheme(goal, ex, cfg) {
  if (!ex || ex.bp === 'cardio' || (cfg && modeOf({ ...cfg, id: ex.id }) !== 'reps')) return null
  const pair = BY_GOAL[goal] || GENERAL
  return { ...pair[isCompound(ex) ? 0 : 1] }
}

/** Does a planned exercise already follow the suggestion? (No suggestion counts as yes.) */
export function followsSuggestion(cfg, ex, goal) {
  const sug = suggestScheme(goal, ex, cfg)
  if (!sug) return true
  const { lo, hi } = repRangeOf({ ...cfg, id: ex.id })
  return (cfg.sets || 1) === sug.sets && lo === sug.lo && hi === sug.hi
}

/** `cfg` changed to the suggestion — sets and reps only, weight and everything else kept. */
export function applySuggestion(cfg, ex, goal) {
  const sug = suggestScheme(goal, ex, cfg)
  return sug ? withRepRange({ ...cfg, sets: sug.sets }, sug.lo, sug.hi) : cfg
}
