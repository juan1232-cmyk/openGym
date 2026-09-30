// Example profiles for the preview, dated relative to today so it always looks current:
// the app's own 6-day starter plan (lib/starter.js), six weeks of history on it with steady
// progression and a few skipped days, body weight, and a Peek that knows you a little.
import { starterPlan } from '../../frontend/src/lib/starter.js'
import { isBw, workoutVolume } from '../../frontend/src/lib/history.js'
import { isoOf } from '../../frontend/src/lib/format.js'

const DAY = 864e5
// a working weight for every lift in the starter plan, by position in its routine
const BASE = { '0025': 70, '0047': 26, '0426': 40, '0334': 12, '0241': 25, '0251': 22, '0027': 60, '1323': 50, '0031': 45, '0313': 12, '0043': 90, '0085': 110, '0739': 40, '0585': 45, '0586': 60, '0605': 50 }
const r25 = x => Math.round(x / 2.5) * 2.5

function history(daysBack, gap = 0) {
  const plan = starterPlan({ goal: 'muscle', days: 6 })
  const rById = Object.fromEntries(plan.routines.map(r => [r.id, r]))
  const best = {}, workouts = [], now = Date.now()
  for (let back = daysBack; back >= 1 + gap; back--) {
    const d = new Date(now - back * DAY)
    const rid = plan.week[d.getDay()]
    if (!rid || back % 11 === 5) continue                 // a few skipped days, like real life
    const r = rById[rid]
    const k = (daysBack - back) / daysBack                // 0 → 1 across the history
    const start = new Date(d); start.setHours(18, 10, 0, 0)
    const prs = []
    const entries = r.ex.map(cfg => {
      const bw = isBw(cfg)
      // weight goes up in three steps over the six weeks, so records come now and then
      const w = bw ? 0 : r25((BASE[cfg.id] || 30) * (0.86 + 0.14 * Math.floor(k * 3) / 3))
      const sets = Array.from({ length: cfg.sets }, (_, i) => ({ w, r: i === cfg.sets - 1 && back % 3 === 0 ? cfg.reps - 1 : cfg.reps, done: true }))
      if (w > 0) { if (best[cfg.id] && w > best[cfg.id]) prs.push(cfg.id); best[cfg.id] = Math.max(best[cfg.id] || 0, w) }
      return { id: cfg.id, sets, topW: w || null, target: { ...cfg, weight: w } }
    })
    // nothing record-breaking in the last few days: a fresh PR would take over Home, and each
    // situation should open on its own mood (the "PR today" one adds its own)
    const wk = { id: 'pv' + back, d: isoOf(d), start: start.getTime(), end: start.getTime() + (48 + (back % 4) * 6) * 60e3, routineId: r.id, name: r.name, entries, prs: back - gap <= 3 ? [] : prs }
    wk.vol = workoutVolume(wk)
    workouts.push(wk)
  }
  // routines carry today's working weights, so the next session starts from them
  plan.routines.forEach(r => r.ex.forEach(c => { if (!isBw(c)) c.weight = best[c.id] || r25(BASE[c.id] || 30) }))
  const exWeights = Object.fromEntries(Object.entries(best).map(([id, w]) => [id, { w, d: isoOf(new Date(now - (1 + gap) * DAY)) }]))
  const bodyweight = Array.from({ length: 15 }, (_, i) => {
    const d = new Date(now - (daysBack - i * 3) * DAY)
    return { d: isoOf(d), t: d.getTime(), w: Math.round((79.4 - i * 0.12 + (i % 2) * 0.3) * 10) / 10 }
  }).filter(b => b.t < now)
  return { plan, workouts, exWeights, bodyweight }
}

function profile({ gap = 0, bond = 30, today = false } = {}) {
  const { plan, workouts, exWeights, bodyweight } = history(42 + gap, gap)
  if (today) {
    // a session already done today, with a PR — Home opens celebrating
    const last = workouts.filter(w => w.name === 'Push Day').pop()
    const d = new Date()
    const up = { ...last, id: 'pvtoday', d: isoOf(d), start: d.getTime() - 70 * 60e3, end: d.getTime() - 10 * 60e3, prs: ['0025'],
      entries: last.entries.map(e => (e.id === '0025' ? { ...e, sets: e.sets.map(s => ({ ...s, w: s.w + 2.5 })) } : e)) }
    up.vol = workoutVolume(up)
    workouts.push(up)
  }
  const firstD = workouts.length ? workouts[0].d : isoOf(new Date())
  return {
    goal: 'muscle', days: 6, unit: 'kg', restSec: 90, lang: 'en', theme: 'dark', accent: 'lime',
    routines: plan.routines, week: plan.week, dayPlan: {}, workouts, exWeights, bodyweight, targetW: 76,
    peek: {
      bond, voice: true, push: true, honesty: 'normal', said: [], carry: 0,
      moments: [{ k: 'first', d: firstD }, ...workouts.filter(w => w.prs.length).slice(-4).map(w => ({ k: 'pr', d: w.d, x: w.prs[0] }))]
    }
  }
}

export const SCENARIOS = [
  { id: 'regular', label: 'Regular week', hint: 'Six weeks of Push / Pull / Legs, trained yesterday, today is planned.', state: () => profile() },
  { id: 'pr', label: 'PR today', hint: 'Already trained today and beat the bench press.', state: () => profile({ today: true }) },
  { id: 'away', label: 'Back after a week', hint: 'Last workout 8 days ago. Peek has feelings about it.', state: () => profile({ gap: 8 }) },
  { id: 'night', label: 'Late night', hint: "It's 2am. Peek is asleep. Tap it.", state: () => profile(), night: true },
  { id: 'fresh', label: 'Brand new', hint: 'No account data at all: onboarding, goals, empty screens.', state: () => ({}) }
]
export const BONDS = [['Stranger', 5], ['Acquaintance', 30], ['Partner', 60], ['Ride or die', 90]]
