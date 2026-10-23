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

// A fuller profile for the Actions version of Stats: eight weeks of Push / Pull / Legs, trained
// Monday, Wednesday and Saturday. The plan says Friday for legs and it never happens, so there is
// a skipped weekday with a day already trained to move it to. Overhead press sits at 40 × 8 the
// whole time (a flat lift), legs get only two sets of hamstring work (a muscle the plan leaves
// short), and the last weigh-in is nine days old while the trend runs away from the goal. Body
// weight and a goal are in so the Numbers version has something to draw too. What the week
// holds depends on the weekday it is opened on — that is the point of building it from today.
const OHP = '0091', PUSHDOWN = '0201', LAT = '0818', CURL = '0031', LEGCURL = '0586', CALF = '1372'
const pplRoutines = () => [
  { id: 'push', name: 'Push', ex: [{ id: BENCH, sets: 4, reps: 5 }, { id: OHP, sets: 3, reps: 8 }, { id: PUSHDOWN, sets: 3, reps: 10 }] },
  { id: 'pull', name: 'Pull', ex: [{ id: ROW, sets: 4, reps: 6 }, { id: LAT, sets: 3, reps: 10 }, { id: CURL, sets: 3, reps: 10 }] },
  { id: 'legs', name: 'Legs', ex: [{ id: SQUAT, sets: 4, reps: 5 }, { id: LEGCURL, sets: 2, reps: 10 }, { id: CALF, sets: 3, reps: 12 }] }
]
// session number i of a lift → [weight, reps]
const PPL_LOAD = {
  [BENCH]: i => [60 + 2.5 * i, 5], [OHP]: () => [40, 8], [PUSHDOWN]: i => [30 + 2.5 * (i >> 1), 10],
  [ROW]: i => [60 + 2.5 * i, 6], [LAT]: i => [50 + 2.5 * (i >> 1), 10], [CURL]: i => [25 + 2.5 * (i >> 1), 10],
  [SQUAT]: i => [80 + 5 * i, 5], [LEGCURL]: i => [30 + 2.5 * (i >> 1), 10], [CALF]: i => [50 + 2.5 * (i >> 1), 12]
}
// (an accessory that goes up only every few sessions would show as flat too, and crowd out the
// lift this profile is meant to have flat)
function logPPL(now) {
  const today = isoOf(now)
  const mon = new Date(now.getTime() - ((now.getDay() + 6) % 7) * DAY)
  const routines = pplRoutines()
  const done = {}
  const out = []
  for (let w = 7; w >= 0; w--) {
    for (const [rid, offset] of [['push', 0], ['pull', 2], ['legs', 5]]) {
      const d = isoOf(new Date(mon.getTime() + (offset - 7 * w) * DAY))
      if (d >= today) continue                 // today stays open, and nothing is in the future
      const r = routines.find(x => x.id === rid)
      const i = done[rid] = (done[rid] ?? -1) + 1
      const start = new Date(d + 'T18:00:00').getTime()
      const entries = r.ex.map(c => {
        const [w, reps] = PPL_LOAD[c.id](i)
        return { id: c.id, sets: Array.from({ length: c.sets }, () => ({ w, r: reps, done: true })), target: { sets: c.sets, reps: c.reps } }
      })
      const vol = entries.reduce((a, e) => a + e.sets.reduce((b, s) => b + s.w * s.r, 0), 0)
      out.push({ id: 'ppl-' + d, d, start, end: start + 62 * 6e4, routineId: rid, name: r.name, vol, entries, prs: [] })
    }
  }
  return out
}
const busyWeek = now => ({
  unit: 'kg', goal: 'strength', days: 3, routines: pplRoutines(), week: { 1: 'push', 3: 'pull', 5: 'legs' }, dayPlan: {},
  workouts: logPPL(now), exWeights: {}, active: null, customEx: [], targetW: 75,
  // weekly weigh-ins, the newest nine days ago, drifting up from 79.2 to 80.7 against a goal of 75
  bodyweight: Array.from({ length: 7 }, (_, k) => ({ d: isoOf(new Date(now.getTime() - (9 + 7 * (6 - k)) * DAY)), w: 79.2 + k * 0.25 }))
})

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
  // three routines over eight weeks, built so every suggestion on Stats → Actions has something to say
  busy: { label: 'Busy week', verdict: 'progressing', path: '/stats', state: busyWeek },
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
