// Ratings for the exercise score (layer 1 of the training engine): 1,082 exercises rated for
// the muscles they actually load, following the Peek exercise scoring spec (v2). Data only —
// the formulas are in score.js, the weights in engine-config.js.
//
// S stretch · L the target muscle is what gives out · St stability · P easy to progress ·
// T strength transfer · C whole-body cost (higher is worse). All 0–10.
// S and L are per target muscle (a pull-up has one of each for the lats and for the biceps);
// St, P, T and C describe the exercise as a whole.
//
// The table is ratings-data.json, made from scripts/peek-scoring/exercise-ratings.json by
// scripts/peek-scoring/pack.mjs, and loaded on demand: it is ~90 KB that the home screen never
// reads. Until it arrives every lookup answers "not rated" — the same thing the app already
// does for an exercise nobody rated, so nothing needs a loading state. Screens that show a
// score call useRatings() (store/useRatings.js) to redraw when it lands.

// How far to trust each kind of rating, shown next to the number. Only the stretch ratings for
// triceps, hamstrings, calves and the reclined leg extension follow direct studies; the rest
// is reasoning. `EVIDENCE` is by kind of rating, not by exercise.
export const EVIDENCE = { S: 'B', L: 'C', St: 'B', P: 'C', T: 'A', C: 'C' }
export const EVIDENCE_NAME = {
  A: 'Strong studies',
  B: 'Some direct studies',
  C: 'Reasoning, no direct study yet'
}

// The spec's muscle names are finer than the body map's (muscles.js): it tells the upper chest
// from the chest, the three delt heads apart, and the lats from the upper back. `slug` is the
// body-map muscle each one counts toward, so a picker filtered to "Chest" can still find the
// rating for the exercise's chest-side target.
export const TARGETS = {
  chest: { name: 'Chest', slug: 'chest' },
  upper_chest: { name: 'Upper chest', slug: 'chest' },
  front_delts: { name: 'Front delts', slug: 'deltoids' },
  side_delts: { name: 'Side delts', slug: 'deltoids' },
  rear_delts: { name: 'Rear delts', slug: 'deltoids' },
  lats: { name: 'Lats', slug: 'upper-back' },
  upper_back: { name: 'Upper back', slug: 'upper-back' },
  lower_back: { name: 'Lower back', slug: 'lower-back' },
  traps: { name: 'Traps', slug: 'trapezius' },
  biceps: { name: 'Biceps', slug: 'biceps' },
  triceps: { name: 'Triceps', slug: 'triceps' },
  forearms: { name: 'Forearms', slug: 'forearm' },
  abs: { name: 'Abs', slug: 'abs' },
  obliques: { name: 'Obliques', slug: 'obliques' },
  glutes: { name: 'Glutes', slug: 'gluteal' },
  quads: { name: 'Quads', slug: 'quadriceps' },
  hamstrings: { name: 'Hamstrings', slug: 'hamstring' },
  calves: { name: 'Calves', slug: 'calves' },
  adductors: { name: 'Adductors', slug: 'adductors' },
  abductors: { name: 'Abductors', slug: 'gluteal' }
}

let TABLE = null
let loading = null
let byTarget = null
const listeners = new Set()
const notify = () => listeners.forEach(f => f())

/** Subscribe to "the table arrived" (useSyncExternalStore's contract: returns the unsubscribe). */
export const onRatings = f => { listeners.add(f); return () => listeners.delete(f) }
export const ratingsReady = () => TABLE != null

/** Install a table directly — what tests do, and nothing else should. null = back to unloaded. */
export function setRatings(table) {
  TABLE = table
  byTarget = null
  notify()
}

/** Fetch the table once. Resolves when it's in; a failed fetch leaves the app unrated, and a retry possible. */
export function loadRatings() {
  if (TABLE) return Promise.resolve()
  return loading || (loading = import('./ratings-data.json')
    .then(m => setRatings(m.default))
    .catch(() => {})
    .finally(() => { loading = null }))
}

// One record as the rest of the app reads it: ratings for ONE target muscle. Asking for the
// exercise with no muscle gives its first target — the table lists the main one first.
const view = (id, r, t) => ({
  id, muscle: t[0], S: t[1], L: t[2], St: r.St, P: r.P, T: r.T, C: r.C,
  studied: r.y || '', confidence: r.f, secondary: r.x || [],
  targets: r.t.map(x => x[0])
})

/** Ratings for exercise `id` as seen by `muscle` (a TARGETS key; default: its main target). null if unrated. */
export function ratingOf(id, muscle) {
  const r = TABLE && TABLE[id]
  if (!r) return null
  const t = muscle ? r.t.find(x => x[0] === muscle) : r.t[0]
  return t ? view(id, r, t) : null
}

/** The muscles an exercise is rated for, main one first — [] when unrated. */
export const targetsOf = id => (TABLE && TABLE[id] ? TABLE[id].t.map(x => x[0]) : [])

/** The target of `id` that counts toward a body-map muscle slug, or its main target if none does. */
export function targetFor(id, slug) {
  const ts = targetsOf(id)
  return ts.find(m => TARGETS[m] && TARGETS[m].slug === slug) || ts[0] || null
}

/** Every exercise id rated for `muscle`. Built on first use: 1,082 records, once. */
export function ratedFor(muscle) {
  if (!TABLE) return []
  if (!byTarget) {
    byTarget = {}
    for (const [id, r] of Object.entries(TABLE)) r.t.forEach(x => (byTarget[x[0]] = byTarget[x[0]] || []).push(id))
  }
  return byTarget[muscle] || []
}
