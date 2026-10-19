// Exercise score: layer 1 of the training engine. One 0–100 number per exercise and target
// muscle, built from six ratings (ratings.js) with the weights in engine-config.js, so two
// exercises for the same muscle can be put side by side and the reason one wins is visible.
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
import { ratingOf, ratedFor, targetsOf } from './ratings.js'
import { RATINGS, H_WEIGHTS, STR_WEIGHTS, COST_PENALTY, GOAL_SPLIT, COMFORT_MIN, COMFORT_FACTOR, SAME_WITHIN, STUDIED_PAIRS, SMALL_IMPACT } from './engine-config.js'

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

/**
 * The other exercises rated for the same target muscle, best first — what a comparison is
 * against. Each is scored for that muscle, so a pull-up shows up under lats with its lat
 * numbers and under biceps with its biceps numbers.
 */
export function ratedAlternatives(exId, comfort = {}, muscle) {
  const m = muscle || targetsOf(exId)[0]
  if (!m) return []
  return ratedFor(m).filter(id => id !== exId)
    .map(id => scoreOf(id, comfort[id], m)).sort((a, b) => b.score - a.score)
}

// Which side a study picks, 'a' | 'b' | null. Only when both ends carry a studied tag that
// forms a pair.
function studiedWinner(a, b) {
  for (const [better, worse] of STUDIED_PAIRS) {
    if (a.studied === better && b.studied === worse) return 'a'
    if (b.studied === better && a.studied === worse) return 'b'
  }
  return null
}

// The rating that explains a win: give the winner the loser's number for one rating at a time
// and see which swap costs it the most points. That is the rating the win leans on — better
// than "the biggest gap", which can't tell a gap that matters from one the formula barely
// weighs (a 6-point gap in stretch is worth more than a 6-point gap in progression). Null when
// no swap lowers it, i.e. the win doesn't come from any one rating.
function whyWins(w, l, comfort) {
  let best = null
  for (const k of RATINGS) {
    const drop = w.score - scoresOf({ ...w, [k]: l[k] }, comfort).score
    if (drop > (best ? best.drop : 0)) best = { k, from: w[k], to: l[k], drop }
  }
  return best
}

/**
 * Two exercises rated for the same muscle, side by side. Rules, in order:
 *  1. A studied pair (engine-config STUDIED_PAIRS) goes to the side the study favours — unless
 *     either exercise hurts the person's joints: a study doesn't outrank a sore joint.
 *  2. Scores less than SAME_WITHIN apart (as shown, rounded) are "about the same": no winner.
 *  3. Otherwise the higher score wins, and `why` is the one rating whose swap lowers the winner
 *     most.
 * `muscle` is the target both are scored for (default: a's main target); null if either isn't
 * rated for it. `rows` is per rating, ties win nothing, and for cost the lower number wins.
 */
export function compare(aId, bId, comfort = {}, muscle) {
  const m = muscle || targetsOf(aId)[0]
  const a = scoreOf(aId, comfort[aId], m), b = scoreOf(bId, comfort[bId], m)
  if (!a || !b) return null
  const rows = RATINGS.map(k => {
    const d = k === 'C' ? b[k] - a[k] : a[k] - b[k]
    return { k, a: a[k], b: b[k], win: d > 0 ? 'a' : d < 0 ? 'b' : null }
  })
  const study = a.sore || b.sore ? null : studiedWinner(a, b)
  const [ra, rb] = [roundScore(a.score), roundScore(b.score)]
  const win = study || (Math.abs(ra - rb) < SAME_WITHIN ? null : ra > rb ? 'a' : 'b')
  const why = win && (win === 'a' ? whyWins(a, b, comfort[aId]) : whyWins(b, a, comfort[bId]))
  return { muscle: m, a, b, rows, win, studied: !!study, why: why ? { ...why, win } : null }
}

/**
 * The compare sheet's scoreboard for a compare() result: one row per rating, shown so a bigger
 * number always wins (cost becomes "easy on body", 10 − C) and ordered by how many score points
 * a single point of that rating moves for this pair — so the rows that decide it come first.
 * Counting won rows would mislead: two tiny wins don't beat one big one, so each row also
 * carries `impact` (score points its gap is worth to the winner, or to a on a tie), `decisive`
 * (it is the rating compare() names as the reason) and `small` (a win worth under SMALL_IMPACT).
 */
export function scoreboard(c) {
  const [w, l] = c.win === 'b' ? [c.b, c.a] : [c.a, c.b]
  const base = scoresOf(w).score
  const points = (r, k, v) => Math.abs(base - scoresOf({ ...r, [k]: v }).score)
  const perPoint = k => points(w, k, k === 'C' ? w[k] - 1 : w[k] + 1)
  const show = (k, v) => (k === 'C' ? 10 - v : v)
  return c.rows
    .map(r => {
      const impact = points(w, r.k, l[r.k])
      const decisive = !!c.why && c.why.k === r.k
      return {
        ...r, a: show(r.k, r.a), b: show(r.k, r.b), gap: Math.abs(r.a - r.b),
        weight: perPoint(r.k), impact, decisive, small: !!r.win && !decisive && impact < SMALL_IMPACT
      }
    })
    .sort((x, y) => y.weight - x.weight || RATINGS.indexOf(x.k) - RATINGS.indexOf(y.k))
}

// Kit words say how an exercise is loaded, not what it is: "barbell" against "cable" names
// neither lift, so they're only used when a name has nothing else of its own.
const KIT_WORDS = new Set(['barbell', 'dumbbell', 'cable', 'lever', 'leverage', 'machine', 'smith', 'band',
  'resistance', 'kettlebell', 'ez', 'sled', 'weighted', 'assisted', 'rope', 'trap', 'bar'])

/**
 * Short names for two exercises side by side, from up to two words one has and the other
 * doesn't: "cable overhead triceps extension (rope attachment)" against "cable pushdown" reads
 * "overhead triceps" and "pushdown". Falls back to the whole name (bracket stripped) when one
 * name has nothing of its own.
 */
export function shortNames(a, b) {
  const words = n => String(n || '').replace(/\(.*?\)/g, ' ').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  const wa = words(a), wb = words(b)
  const own = (x, y) => {
    const mine = x.filter(w => !y.includes(w))
    const named = mine.filter(w => !KIT_WORDS.has(w))
    return (named.length ? named : mine).slice(0, 2).join(' ') || x.join(' ')
  }
  return [own(wa, wb), own(wb, wa)]
}
