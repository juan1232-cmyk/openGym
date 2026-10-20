// What one exercise's log adds up to, for the Summary and History tabs of the details sheet.
//
// Leaf module on purpose (no imports): it only reads the logged sets, so anything can import it
// without a cycle. A set is {w, r} for lifts, {sec, w} for holds, {min, speed} for cardio, and
// a record is only reported for the fields the log actually has — a bodyweight exercise has no
// heaviest weight to show, a hold has no reps.

const done = en => (en.sets || []).filter(s => s.done)

// Every session in which the exercise was logged, newest first — the History tab. `name` is the
// workout it was part of (older workouts may have none), `target` what was prescribed, which
// setLabel needs to read a timed or bodyweight set back correctly.
export function exerciseSessions(S, exId) {
  const out = []
  for (const w of S.workouts || []) {
    const en = (w.entries || []).find(e => e.id === exId)
    if (!en) continue
    const sets = done(en)
    if (sets.length) out.push({ id: w.id, name: w.name || '', d: w.d, sets, target: en.target || null })
  }
  return out.reverse()
}

const vol = s => (s.w || 0) * (s.r || 0)

// All-time bests. A field is null until the log has something to put in it. `byReps` is the
// heaviest weight lifted for each exact rep count, ascending — Hevy's "Set records".
export function exerciseRecords(S, exId) {
  const rec = { heaviest: null, bestSet: null, bestSession: null, mostReps: null, mostSessionReps: null, longestHold: null, topSpeed: null, longestMin: null, byReps: [] }
  const byReps = new Map()
  for (const w of S.workouts || []) {
    const en = (w.entries || []).find(e => e.id === exId)
    if (!en) continue
    const sets = done(en)
    if (!sets.length) continue
    let sessionVol = 0, sessionReps = 0
    for (const s of sets) {
      const weight = s.w || 0, reps = s.r || 0
      if (weight > 0 && (!rec.heaviest || weight > rec.heaviest.w)) rec.heaviest = { w: weight, d: w.d }
      if (weight > 0 && reps > 0 && (!rec.bestSet || vol(s) > rec.bestSet.vol)) rec.bestSet = { w: weight, r: reps, vol: vol(s), d: w.d }
      if (reps > 0 && (!rec.mostReps || reps > rec.mostReps.r)) rec.mostReps = { r: reps, d: w.d }
      if (s.sec > 0 && (!rec.longestHold || s.sec > rec.longestHold.sec)) rec.longestHold = { sec: s.sec, d: w.d }
      if (s.speed > 0 && (!rec.topSpeed || s.speed > rec.topSpeed.speed)) rec.topSpeed = { speed: s.speed, d: w.d }
      if (s.min > 0 && (!rec.longestMin || s.min > rec.longestMin.min)) rec.longestMin = { min: s.min, d: w.d }
      if (weight > 0 && reps > 0) {
        const r = Math.round(reps)
        if ((byReps.get(r) || 0) < weight) byReps.set(r, weight)
      }
      sessionVol += vol(s)
      sessionReps += reps
    }
    if (sessionVol > 0 && (!rec.bestSession || sessionVol > rec.bestSession.vol)) rec.bestSession = { vol: sessionVol, d: w.d }
    if (sessionReps > 0 && (!rec.mostSessionReps || sessionReps > rec.mostSessionReps.r)) rec.mostSessionReps = { r: sessionReps, d: w.d }
  }
  rec.byReps = [...byReps].map(([reps, w]) => ({ reps, w })).sort((a, b) => a.reps - b.reps)
  return rec
}

// One point per session for each thing worth charting, oldest first — the chart under the
// Summary tab's picture. A key is only present when the log has a value for it, so the chips
// above the chart are exactly the ones that mean something for this exercise.
export function exerciseMetrics(S, exId) {
  const out = {}
  const push = (key, p, y) => { if (y > 0) (out[key] = out[key] || []).push({ t: p.t, d: p.d, y }) }
  for (const w of S.workouts || []) {
    const en = (w.entries || []).find(e => e.id === exId)
    if (!en) continue
    const sets = done(en)
    if (!sets.length) continue
    const p = { t: w.start || new Date(w.d + 'T12:00:00').getTime(), d: w.d }
    const max = f => Math.max(0, ...sets.map(s => s[f] || 0))
    const sum = f => sets.reduce((a, s) => a + (s[f] || 0), 0)
    push('weight', p, max('w'))
    push('setVol', p, Math.max(0, ...sets.map(vol)))
    push('sessionVol', p, sets.reduce((a, s) => a + vol(s), 0))
    // reps only chart on their own when there is no weight to chart instead
    if (!max('w')) { push('reps', p, max('r')); push('sessionReps', p, sum('r')) }
    push('hold', p, max('sec'))
    push('speed', p, max('speed'))
    push('min', p, max('min'))
  }
  return out
}
