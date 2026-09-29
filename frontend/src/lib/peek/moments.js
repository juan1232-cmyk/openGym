// What Peek does during a workout and when it's over. Pure — Workout.jsx and the finish
// journey (sheets/workout.jsx) turn these answers into faces, lines and screens.
//
// During a set it only moves its face. It speaks at a handful of key moments (a PR, two
// missed sets in a row, a rest that drags on, the last set, leaving early) and nowhere else.
import { pickLine } from './lines.js'

/** The face for a set just checked off: hit the target, beat it, or fell short. */
export function setFace(set, target, mode, rng = Math.random) {
  const tg = target || {}
  const short = mode === 'time' ? tg.sec && (set.sec || 0) < tg.sec : mode === 'reps' && tg.reps && (set.r || 0) < tg.reps
  if (short) return rng() < 0.5 ? 'skeptical-left' : 'skeptical-right'
  const beat = mode === 'time' ? tg.sec && set.sec > tg.sec
    : mode === 'reps' && ((tg.reps && set.r > tg.reps) || (tg.weight && set.w > tg.weight))
  if (beat) return rng() < 0.5 ? 'surprised-wide-left' : 'joyful-down-right'
  return 'joyful-wide'
}

/**
 * A set heavier than anything logged before for this exercise — `best` is the heaviest from
 * finished workouts (history.js bestWeightFor). Only the first set to cross it in a session
 * counts, so a PR followed by the same weight again doesn't celebrate twice.
 */
export function isSetPR(entry, i, best) {
  const s = entry.sets[i]
  if (!s || !s.done || !(s.w > 0) || !(best > 0) || s.w <= best) return false
  const before = entry.sets.filter((x, j) => j !== i && x.done && (x.w || 0) > best)
  return !before.length
}

/** This set and the one before it both fell short of the target reps. */
export function missedTwice(entry, i, mode) {
  const goal = entry.target && entry.target.reps
  if (mode !== 'reps' || !goal) return false
  const s = entry.sets[i]
  if (!s || !s.done || (s.r || 0) >= goal) return false
  for (let j = i - 1; j >= 0; j--) {
    const p = entry.sets[j]
    if (p.done) return (p.r || 0) < goal
  }
  return false
}

export const IDLE_MIN = 10
/**
 * Between sets, with no timer running: 'restLong' once the rest has gone to twice the rest
 * setting, 'idle' at ten minutes, else null. The caller fires each one once per set.
 */
export function restState({ lastSetAt, restSec, now, resting, allDone }) {
  if (resting || allDone || lastSetAt == null) return null
  const el = now - lastSetAt
  if (el >= IDLE_MIN * 60e3) return 'idle'
  if (el >= 2 * (restSec || 90) * 1000) return 'restLong'
  return null
}

/* ---------------------------------------------------------------- finish -- */

/**
 * Which screens the finish journey shows. A big day gets the whole story, a normal one
 * gets out of the way. Step ids: done first numbers record skipped trained next verdict summary.
 */
export function journeySteps({ first, prs = [], e1prs = [], early, diff, hasNext }) {
  const next = hasNext ? ['next'] : []
  if (first) return ['done', 'first', 'numbers', 'trained', 'summary']
  // a PR still gets its screen on a short day: that promise doesn't have exceptions
  if (early) return ['done', 'numbers', ...(prs.length || e1prs.length ? ['record'] : []), 'skipped', 'verdict', 'summary']
  if (prs.length || e1prs.length) return ['done', 'numbers', 'record', 'trained', ...next, 'verdict', 'summary']
  if (diff > 0) return ['done', 'numbers', ...next, 'verdict', 'summary']
  return ['done', 'numbers', 'summary']
}

/**
 * Peek's verdict on the session: { tone: good|meh|bad, mood, line, sub, keys }. `prNames` are
 * display names of load PRs, `diff`/`prev` volume against the last time this routine ran,
 * `events` from memory.js afterWorkout, `left` sets unchecked when finished early.
 */
export function finishVerdict({ prNames = [], early, left = 0, diff = null, prev = 0, diffText = '', events = [] }, rng = Math.random, opts = {}) {
  const keys = []
  const say = (sit, ...args) => { const l = pickLine(sit, args, rng, opts); if (l) keys.push(l.key); return l ? l.text : null }
  let v
  if (early) v = { tone: 'bad', mood: opts.honesty === 'gentle' ? 'disappointed' : 'angry', line: say('verdictShort', left) }
  else if (prNames.length > 1) v = { tone: 'good', mood: 'celebrate', line: say('verdictPRs', prNames.length) }
  else if (prNames.length) v = { tone: 'good', mood: 'proud', line: say('verdictPR', prNames[0]) }
  else if (diff > 0) v = { tone: 'good', mood: 'happy', line: say('verdictGood', diffText) }
  else if (prev > 0 && diff < -0.15 * prev) v = { tone: 'bad', mood: 'disappointed', line: say('verdictBad') }
  else v = { tone: 'meh', mood: 'suspicious', line: say('verdictMeh') }

  // the second line is the one it remembers: a new bond stage beats a milestone beats a comeback
  const ev = k => events.find(e => e.k === k)
  const up = ev('stageUp'), ms = ev('milestone'), cb = ev('comeback')
  v.sub = up ? say('stage' + up.stage) : ms ? say('milestone', ms.n) : cb ? say('comeback', cb.days) : null
  v.keys = keys   // the templates used, for memory's "said" list
  return v
}
