// Exercise score: layer 1 of the training engine. One 0–100 number per exercise, built from
// six ratings (ratings.js) with the weights in engine-config.js, so two exercises for the
// same muscle can be put side by side and the reason one wins is visible.
//
// This layer rests on the weakest evidence of the three: most ratings are judgement. So it
// only ever speaks for exercises that were actually rated — the other ~1,300 get null rather
// than a number made up from their name.
import { RATING_OF } from './ratings.js'
import { RATINGS, LOWER_IS_BETTER, H_WEIGHTS, STR_WEIGHTS, COST_PENALTY, GOAL_SPLIT, COMFORT_MIN, COMFORT_FACTOR } from './engine-config.js'

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

const weighted = (r, w) => 10 * Object.keys(w).reduce((n, k) => n + w[k] * r[k], 0)

/**
 * The four numbers behind a rating, unrounded — rounding is the screen's business, and doing
 * it here would let two rounded parts disagree with the rounded whole.
 * `comfort` (0–10, the person's own joint comfort) only touches the final score: H and Str
 * describe the exercise, the score describes it for you.
 */
export function scoresOf(r, comfort) {
  const H = weighted(r, H_WEIGHTS)
  const Heff = H * (1 - COST_PENALTY * r.C)
  const Str = weighted(r, STR_WEIGHTS)
  const base = GOAL_SPLIT.hyp * Heff + GOAL_SPLIT.str * Str
  const sore = comfort != null && comfort < COMFORT_MIN
  return { H, Heff, Str, base, sore, score: sore ? base * COMFORT_FACTOR : base }
}

/** Ratings + scores for one exercise, or null when it was never rated. */
export function scoreOf(exId, comfort) {
  const r = RATING_OF[exId]
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

/** The other rated exercises for the same muscle, best first — what a comparison is against. */
export function ratedAlternatives(exId, comfort = {}) {
  const r = RATING_OF[exId]
  if (!r) return []
  return Object.values(RATING_OF).filter(x => x.muscle === r.muscle && x.id !== exId)
    .map(x => scoreOf(x.id, comfort[x.id])).sort((a, b) => b.score - a.score)
}

/**
 * Two rated exercises side by side → per-rating winners and the biggest gap, the line that
 * explains the scores ("wins on stretch: 9 vs 4"). Ties win nothing. Null if either side was
 * never rated.
 */
export function compare(aId, bId, comfort = {}) {
  const a = scoreOf(aId, comfort[aId]), b = scoreOf(bId, comfort[bId])
  if (!a || !b) return null
  const rows = RATINGS.map(k => {
    const d = LOWER_IS_BETTER.has(k) ? b[k] - a[k] : a[k] - b[k]
    return { k, a: a[k], b: b[k], win: d > 0 ? 'a' : d < 0 ? 'b' : null, gap: Math.abs(a[k] - b[k]) }
  })
  // Earlier ratings win ties: they carry more weight in the score, so they explain more of it.
  const gap = rows.reduce((g, r) => (r.gap > (g ? g.gap : 0) ? r : g), null)
  return { a, b, rows, gap, win: a.score > b.score ? 'a' : b.score > a.score ? 'b' : null }
}
