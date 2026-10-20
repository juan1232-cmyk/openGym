// Exercise score: layer 1 of the training engine. One 0–100 number per exercise and target
// muscle, built from six ratings (ratings.js) with the weights in engine-config.js.
//
// Internal: nothing on screen shows this number, and nothing ranks or compares exercises with it.
// It is there for Peek, the coach, to reason from (reasonOf is the one-line why).
//
//   H     = L × (0.55 S + 0.25 St + 0.20 P)      muscle score — the limiter gates the rest
//   H_eff = H × (1 − 0.04 C)                      after whole-body tiredness
//   Str   = 10 × (0.45 T + 0.25 St + 0.20 P + 0.10 L)
//   score = 0.75 H_eff + 0.25 Str, × 0.8 if joint comfort J < 5
//
// This is the Peek exercise scoring spec (v2); scripts/peek-scoring/score.mjs is the reference
// port and score.test.js holds this file to its numbers for every rated exercise.
//
// This layer rests on the weakest evidence of the three: most ratings are judgement. So it
// only ever speaks for exercises that were actually rated — the rest get null rather than a
// number made up from their name.
import { ratingOf } from './ratings.js'
import { H_WEIGHTS, STR_WEIGHTS, COST_PENALTY, GOAL_SPLIT, COMFORT_MIN, COMFORT_FACTOR } from './engine-config.js'

// English names; these strings are the i18n keys.
export const RATING_NAME = {
  S: 'Stretch', L: 'Limiter', St: 'Stability', P: 'Progression', T: 'Strength transfer', C: 'Cost'
}
export const RATING_Q = {
  S: 'Is it hard when the muscle is stretched?',
  L: 'Is the target muscle what gives out first?',
  St: 'Can you push close to failure safely, the same way every time?',
  P: 'Is it easy to add small amounts of weight?',
  T: 'Can you go heavy, on a lift worth being strong at?',
  C: 'How tired does it make your whole body? Higher is worse.'
}

// Python's round() goes to the even number on an exact .5, Math.round goes up. The spec's
// numbers are Python's, so anything shown next to them rounds the same way.
export function roundScore(x) {
  const f = Math.floor(x), d = x - f
  if (d < 0.5) return f
  if (d > 0.5) return f + 1
  return f % 2 === 0 ? f : f + 1
}

const weighted = (r, w) => Object.keys(w).reduce((n, k) => n + w[k] * r[k], 0)

/**
 * The four numbers behind a rating, unrounded — rounding is the screen's business (roundScore),
 * and doing it here would let two rounded parts disagree with the rounded whole.
 * `comfort` (0–10, the person's own joint comfort) only touches the final score: H and Str
 * describe the exercise, the score describes it for you.
 */
export function scoresOf(r, comfort) {
  const H = (r.L / 10) * 10 * weighted(r, H_WEIGHTS)
  const Heff = H * (1 - COST_PENALTY * r.C)
  const Str = 10 * weighted(r, STR_WEIGHTS)
  const base = GOAL_SPLIT.hyp * Heff + GOAL_SPLIT.str * Str
  const sore = comfort != null && comfort < COMFORT_MIN
  return { H, Heff, Str, base, sore, score: sore ? base * COMFORT_FACTOR : base }
}

/**
 * Ratings + scores for one exercise, for one of its target muscles (default: the main one), or
 * null when it was never rated — or isn't rated for that muscle.
 */
export function scoreOf(exId, comfort, muscle) {
  const r = ratingOf(exId, muscle)
  return r ? { ...r, ...scoresOf(r, comfort) } : null
}

// The one line a picker row has room for: what the exercise is best at, or the warning when
// it costs a lot. Cost first — "very tiring" changes how you'd use a lift more than any
// strength of it does.
export function reasonOf(r) {
  if (r.C >= 7) return 'Very tiring for the whole body'
  const best = ['S', 'L', 'St', 'P'].reduce((a, k) => (r[k] > r[a] ? k : a), 'S')
  return {
    S: 'Hard at the stretch',
    L: 'The target muscle gives out first',
    St: 'Stable — safe to push close to failure',
    P: 'Easy to progress week to week'
  }[best]
}
