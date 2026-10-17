// Estimated one-rep max (issue #18).
//
// Deliberately knows nothing about the exercise database: an estimate needs a weight AND a
// rep count, and only reps-mode sets carry both. Cardio sets ({min, speed}) and timed sets
// ({sec, w}) therefore drop out of every scan here on their own — there is no exercise-type
// check to keep in sync.
//
// Formulas are the usual submaximal-load estimators. Epley is the default because it is the
// one most lifters have seen; all of them agree closely at low reps and diverge as reps rise,
// which is exactly why REP_CAP exists.

// Above this many reps an estimate says more about work capacity than about maximal strength,
// and the formulas disagree by double digits. Refusing to guess beats printing a fantasy.
export const REP_CAP = 12

export const FORMULAS = {
  // Epley 1985 — w · (1 + r/30)
  epley: (w, r) => w * (1 + r / 30),
  // Brzycki 1993 — w · 36/(37 − r); undefined at r ≥ 37, but REP_CAP is far below that
  brzycki: (w, r) => w * 36 / (37 - r),
  // Lombardi 1989 — w · r^0.10
  lombardi: (w, r) => w * Math.pow(r, 0.1)
}
export const DEFAULT_FORMULA = 'epley'

// Estimate a 1RM from a weight and a rep count — the calculator's question, with no effort
// attached (logged sets go through estimateSet below). Returns null for anything it cannot honestly answer:
// missing/zero/negative load, no reps, non-finite input, or more reps than REP_CAP.
// A single rep is not an estimate — it is the measurement — and comes back unchanged.
export function estimate1RM(w, r, formula = DEFAULT_FORMULA) {
  const weight = Number(w)
  const reps = Number(r)
  if (!isFinite(weight) || !isFinite(reps)) return null
  if (weight <= 0 || reps < 1) return null
  if (reps > REP_CAP) return null
  const fn = FORMULAS[formula] || FORMULAS[DEFAULT_FORMULA]
  const est = reps === 1 ? weight : fn(weight, Math.round(reps))
  if (!isFinite(est) || est <= 0) return null
  return Math.round(est * 10) / 10
}

// Reps in reserve for one set, or null when it was never rated. The same reading as rirOf in
// effort.js, copied rather than imported: effort.js pulls in history.js, and this file stays
// a leaf that anything can import without a cycle.
const rirOfSet = s => (s.rir != null ? Number(s.rir) : s.rpe != null ? 10 - Number(s.rpe) : null)

// Estimate a 1RM from one logged set, counting the reps it had left. 60 × 8 with 2 in reserve
// is a set of 10 that stopped early, and Epley is a formula for sets taken to failure — so a
// rated set is read as reps + RIR. REP_CAP then applies to that total: 10 reps with 3 left is
// a 13-rep max, past what the formulas can honestly speak to. An unrated set has nothing to
// add and gives exactly what estimate1RM always gave, which keeps every pre-RIR log stable.
export function estimateSet(s, formula = DEFAULT_FORMULA) {
  if (!s) return null
  const reps = Number(s.r)
  if (!isFinite(reps) || reps < 1) return null
  const rir = rirOfSet(s)
  if (rir == null || !isFinite(rir)) return estimate1RM(s.w, reps, formula)
  return estimate1RM(s.w, reps + Math.max(0, rir), formula)
}

// Best estimate out of one workout entry's completed sets.
// `topW` is ignored on purpose: it records the working weight a user confirmed after the
// exercise, with no rep count attached, so it cannot produce an estimate.
export function bestSetOf(entry, formula = DEFAULT_FORMULA) {
  let best = null
  ;(entry?.sets || []).forEach(s => {
    if (!s.done) return
    const est = estimateSet(s, formula)
    if (est === null || (best && est <= best.est)) return
    best = { est, w: Number(s.w), r: Math.round(Number(s.r)) }
    const rir = rirOfSet(s)
    if (rir != null) best.rir = rir
  })
  return best
}

// One point per workout in which the exercise produced an estimate — feeds the trend chart.
// Chronological, matching the order workouts are appended in.
export function e1rmSeries(S, exId, formula = DEFAULT_FORMULA) {
  const pts = []
  ;(S.workouts || []).forEach(w => {
    const entry = w.entries.find(e => e.id === exId)
    if (!entry) return
    const best = bestSetOf(entry, formula)
    if (best) pts.push({ t: w.start, d: w.d, y: best.est, w: best.w, r: best.r, ...(best.rir != null ? { rir: best.rir } : {}) })
  })
  return pts
}

// All-time best estimate for an exercise, with the set and date it came from — the source
// matters, because "142.5 kg est. from 100×10" is a very different claim from "from 140×1".
export function best1RM(S, exId, formula = DEFAULT_FORMULA) {
  let best = null
  e1rmSeries(S, exId, formula).forEach(p => { if (!best || p.y > best.est) best = { est: p.y, w: p.w, r: p.r, ...(p.rir != null ? { rir: p.rir } : {}), d: p.d, t: p.t } })
  return best
}

// Did this workout beat every estimate that came before it? Used for the finish summary,
// so it compares against history that does not yet contain `w`. A first estimate has
// nothing to beat and is not a record (same rule as isLoadPR in history.js).
export function is1RMRecord(S, exId, entry, formula = DEFAULT_FORMULA) {
  const now = bestSetOf(entry, formula)
  if (!now) return null
  const prev = best1RM(S, exId, formula)
  return prev && now.est > prev.est ? { ...now, prev: prev.est } : null
}
