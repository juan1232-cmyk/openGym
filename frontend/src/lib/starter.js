// The Push/Pull/Legs starter plan. Shared by the "Load starter plan" action in Settings
// and by the demo build, which seeds a history on top of exactly these routines.
import { uid } from './format.js'

const SPEC = [
  ['Push Day', 'barbell', [['0025', 4, 8], ['0047', 3, 10], ['0426', 3, 10], ['0334', 3, 12], ['0241', 3, 12], ['0251', 3, 10]]],
  ['Pull Day', 'pullup', [['2330', 4, 10], ['0027', 4, 8], ['1323', 3, 10], ['0031', 3, 10], ['0313', 3, 12]]],
  ['Leg Day', 'legs', [['0043', 4, 8], ['0085', 3, 10], ['0739', 3, 12], ['0585', 3, 12], ['0586', 3, 12], ['0605', 4, 15]]]
]

// Fresh routine objects (new ids) — [push, pull, legs].
export const starterRoutines = () =>
  SPEC.map(([name, emoji, list]) => ({ id: uid(), name, emoji, ex: list.map(([id, sets, reps]) => ({ id, sets, reps, weight: 0 })) }))

// An upper/lower pair for the schedules PPL doesn't divide into (2 and 4 days a week, and the
// last two days of 5). Built from the same exercises as the PPL days, so the library and any
// logged history line up whichever split a profile starts on.
const UPPER = ['Upper Body', 'dumbbell', [['0025', 4, 8], ['0027', 4, 8], ['0426', 3, 10], ['2330', 3, 10], ['0241', 3, 12], ['0031', 3, 12]]]
const LOWER = ['Lower Body', 'legs', [['0043', 4, 8], ['0085', 3, 10], ['0739', 3, 12], ['0586', 3, 12], ['0605', 4, 15]]]

// Which split runs on which weekday (0 = Sunday, as in S.week), per training days a week.
// Every schedule leaves a day off between the two halves where it can, and Sunday free.
const SCHEDULES = {
  2: { 1: 'upper', 4: 'lower' },
  3: { 1: 'push', 3: 'pull', 5: 'legs' },
  4: { 1: 'upper', 2: 'lower', 4: 'upper', 5: 'lower' },
  5: { 1: 'push', 2: 'pull', 3: 'legs', 5: 'upper', 6: 'lower' },
  6: { 1: 'push', 2: 'pull', 3: 'legs', 4: 'push', 5: 'pull', 6: 'legs' }
}
export const GOALS = ['muscle', 'strength', 'fat', 'consistent']
export const DAY_OPTIONS = [2, 3, 4, 5, 6]

// The onboarding answer ("what are we training for, how many days") turned into a plan.
// What the goal changes is deliberately small and all of it is editable afterwards:
//   muscle     — the starter plan as it is (8–12 reps)
//   strength   — each day's first lift becomes 5×5, and rest goes to 150s
//   fat        — same lifts, rest down to 60s so the session stays dense
//   consistent — every day capped at four exercises, for sessions short enough to keep
// Returns { routines, week, restSec } — restSec is null when the goal doesn't change it.
export function starterPlan({ goal = 'muscle', days = 3 } = {}) {
  const sched = SCHEDULES[days] || SCHEDULES[3]
  const specs = { push: SPEC[0], pull: SPEC[1], legs: SPEC[2], upper: UPPER, lower: LOWER }
  const byKey = {}
  const week = {}
  Object.entries(sched).forEach(([wd, key]) => {
    if (!byKey[key]) {
      const [name, emoji, list] = specs[key]
      let ex = list.map(([id, sets, reps]) => ({ id, sets, reps, weight: 0 }))
      if (goal === 'strength') ex[0] = { ...ex[0], sets: 5, reps: 5 }
      if (goal === 'consistent') ex = ex.slice(0, 4)
      byKey[key] = { id: uid(), name, emoji, ex }
    }
    week[wd] = byKey[key].id
  })
  const restSec = goal === 'strength' ? 150 : goal === 'fat' ? 60 : null
  return { routines: Object.values(byKey), week, restSec }
}
