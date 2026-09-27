// Numbers behind one exercise's progress screen (Peek design, D7).
import { e1rmSeries } from './onerm.js'
import { modeOf } from './history.js'

const DAY = 86400000

// The latest way this exercise was logged decides what "better" means on the chart — the same
// rule Stats uses, so a switched exercise drops old points instead of mixing units.
function latestMode(S, exId) {
  for (let i = (S.workouts || []).length - 1; i >= 0; i--) {
    const en = S.workouts[i].entries.find(e => e.id === exId)
    if (en) return modeOf({ ...(en.target || {}), id: exId })
  }
  return modeOf({ id: exId })
}

// What the screen charts, one point per session, oldest first: the estimated 1RM wherever the
// log supports one, else the unit that session's best set is measured in — the heaviest weight
// (sets past the 1RM rep cap), the most reps (unloaded bodyweight), the longest hold, the top
// speed. `top` is the heaviest set weight per session regardless, which is what the coach
// line talks about: you add weight to the bar, not to an estimate.
export function progressSeries(S, exId) {
  const mode = latestMode(S, exId)
  const rows = []
  for (const w of S.workouts || []) {
    const en = w.entries.find(e => e.id === exId)
    if (!en) continue
    const sets = en.sets.filter(s => s.done)
    if (sets.length) rows.push({ t: w.start || new Date(w.d + 'T12:00:00').getTime(), d: w.d, sets, target: en.target })
  }
  const top = rows.map(r => ({ t: r.t, d: r.d, y: Math.max(0, ...r.sets.map(s => s.w || 0)) })).filter(p => p.y > 0)
  const e1 = mode === 'reps' ? e1rmSeries(S, exId) : []
  if (e1.length) return { kind: 'e1rm', points: e1.map(p => ({ t: p.t, d: p.d, y: p.y })), top, rows }
  const kind = mode === 'cardio' ? 'speed' : mode === 'time' ? 'sec' : top.length ? 'weight' : 'reps'
  const f = kind === 'speed' ? 'speed' : kind === 'sec' ? 'sec' : kind === 'weight' ? 'w' : 'r'
  const points = rows.map(r => ({ t: r.t, d: r.d, y: Math.max(0, ...r.sets.map(s => s[f] || 0)) })).filter(p => p.y > 0)
  return { kind, points, top, rows }
}

// Least-squares trend of a series, as change per 14 days. Null until there's enough to call it
// a trend: three sessions spread over at least ten days. A best-fit line rather than last-minus-
// first, so one great or awful day at either end doesn't set the headline.
export function trendPer14(points) {
  if (!points || points.length < 3) return null
  const span = points[points.length - 1].t - points[0].t
  if (span < 10 * DAY) return null
  const n = points.length
  const mx = points.reduce((a, p) => a + p.t, 0) / n
  const my = points.reduce((a, p) => a + p.y, 0) / n
  let num = 0, den = 0
  for (const p of points) { num += (p.t - mx) * (p.y - my); den += (p.t - mx) ** 2 }
  return den ? (num / den) * 14 * DAY : null
}
