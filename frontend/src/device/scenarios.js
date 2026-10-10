// Demo profiles for the device page (device.html): a few weeks of made-up training each, shaped
// so the orb lands on a specific verdict — the only way to see every one of them without
// logging a month of sessions. scenarios.test.js holds each one to the verdict it's named for,
// so a change to lib/verdict.js can't quietly turn the "Slipping" button into something else.
import { isoOf } from '../lib/format.js'

const DAY = 864e5
const BENCH = '0025', ROW = '0027', SQUAT = '0043'
const ROUTINE = { id: 'demo', name: 'Full body', ex: [
  { id: BENCH, sets: 3, reps: 5 }, { id: SQUAT, sets: 3, reps: 5 }, { id: ROW, sets: 3, reps: 5 }
] }
// days ago, oldest first — about twice a week for a month
const RECENT = [24, 21, 17, 14, 10, 7, 3, 1]

// One finished session per entry of `days`; `lifts` maps an exercise id to (session index) →
// [weight, reps], the same three sets each time.
function log(now, lifts, days = RECENT) {
  return days.map((n, i) => {
    const day = new Date(now.getTime() - n * DAY)
    const d = isoOf(day)
    const start = new Date(d + 'T18:00:00').getTime()
    const entries = Object.entries(lifts).map(([id, f]) => {
      const [w, r] = f(i)
      return { id, sets: [0, 1, 2].map(() => ({ w, r, done: true })), target: { sets: 3, reps: 5 } }
    })
    const vol = entries.reduce((a, e) => a + e.sets.reduce((b, s) => b + s.w * s.r, 0), 0)
    return { id: 'demo-' + n, d, start, end: start + 55 * 6e4, routineId: ROUTINE.id, name: ROUTINE.name, vol, entries, prs: [] }
  })
}
const profile = workouts => ({
  unit: 'kg', goal: 'strength', days: 3, routines: [ROUTINE], week: { 1: 'demo', 3: 'demo', 5: 'demo' },
  dayPlan: {}, workouts, bodyweight: [], exWeights: {}, active: null, customEx: []
})

const up = (from, step) => i => [from + i * step, 5]
const flat = w => () => [w, 5]

export const SCENARIOS = {
  fresh: { label: 'Fresh start', verdict: null, state: () => null },
  progressing: { label: 'Progressing', verdict: 'progressing',
    state: now => profile(log(now, { [BENCH]: up(60, 2.5), [SQUAT]: up(90, 5), [ROW]: flat(60) })) },
  holding: { label: 'Holding', verdict: 'holding',
    state: now => profile(log(now, { [BENCH]: flat(70), [SQUAT]: flat(100), [ROW]: flat(60) })) },
  slipping: { label: 'Slipping', verdict: 'slipping',
    state: now => profile(log(now, { [BENCH]: up(80, -2.5), [SQUAT]: up(120, -5), [ROW]: flat(60) })) },
  // the weight never changes and every session ends two reps short of the five planned
  stalled: { label: 'Stalled', verdict: 'stalled',
    state: now => profile(log(now, { [BENCH]: () => [70, 3], [SQUAT]: () => [100, 3], [ROW]: flat(60) })) },
  away: { label: 'Away', verdict: 'away',
    state: now => profile(log(now, { [BENCH]: up(60, 2.5), [SQUAT]: up(90, 5) }, [34, 31, 27, 24, 20, 17, 14, 12])) },
  // progressing, with a session open on bench: set 1 heavier than last time, 2 the same, 3 lighter
  // — tick them to see the orb hop, nod and sink
  workout: { label: 'Mid-workout', verdict: 'progressing', path: '/workout',
    state: now => {
      const S = SCENARIOS.progressing.state(now)
      S.active = { id: 'demo-active', d: isoOf(now), start: now.getTime() - 20 * 6e4, routineId: ROUTINE.id, name: ROUTINE.name, cur: 0,
        entries: [{ id: BENCH, sets: [80, 77.5, 70].map(w => ({ w, r: 5, done: false })), target: { sets: 3, reps: 5 } }] }
      return S
    } }
}
