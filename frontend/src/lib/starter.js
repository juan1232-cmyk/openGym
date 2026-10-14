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
// One day a week gets everything once.
const FULL = ['Full Body', 'barbell', [['0043', 3, 8], ['0025', 3, 8], ['0027', 3, 8], ['0426', 3, 10], ['0085', 3, 10]]]

// Which split runs on which weekday (0 = Sunday, as in S.week), per training days a week.
// Every schedule leaves a day off between the two halves where it can, and Sunday free.
const SCHEDULES = {
  2: { 1: 'upper', 4: 'lower' },
  3: { 1: 'push', 3: 'pull', 5: 'legs' },
  4: { 1: 'upper', 2: 'lower', 4: 'upper', 5: 'lower' },
  5: { 1: 'push', 2: 'pull', 3: 'legs', 5: 'upper', 6: 'lower' },
  6: { 1: 'push', 2: 'pull', 3: 'legs', 4: 'push', 5: 'pull', 6: 'legs' }
}
// The same splits in order, for weekdays someone picked themselves: the split goes by how many
// days there are and lands on exactly those days, Monday first.
const SPLIT_FOR = {
  1: ['full'], 2: ['upper', 'lower'], 3: ['push', 'pull', 'legs'], 4: ['upper', 'lower', 'upper', 'lower'],
  5: ['push', 'pull', 'legs', 'upper', 'lower'], 6: ['push', 'pull', 'legs', 'push', 'pull', 'legs']
}
const MON_FIRST = [1, 2, 3, 4, 5, 6, 0]

// Lifts the kit can't do, swapped for the closest thing it can (null drops it: a pull day
// without a barbell is pull-ups, rows and chin-ups — a fourth "curl" from the floor isn't one).
// Every id here is checked against the dataset and the kit's equipment in starter.test.js.
const KIT_SWAPS = {
  home: {
    '0025': '0289', '0047': '0314', '0241': '0333', '2330': '0375', '0027': '0293', '1323': '0292', '0031': '0294',
    '0043': '1760', '0085': '1459', '0739': '0336', '0585': '0410', '0586': '1757', '0605': '0417'
  },
  bodyweight: {
    '0025': '0662', '0047': '0279', '0426': '0471', '0334': null, '0241': '0283', '2330': '0652', '0027': '0499',
    '1323': '1326', '0031': null, '0313': null, '0043': '2368', '0085': '3013', '0739': '1460', '0585': '1489',
    '0586': '0496', '0605': '1373'
  }
}
export const KITS = ['gym', 'home', 'bodyweight']
export const GOALS = ['muscle', 'strength', 'fat', 'consistent']
export const DAY_OPTIONS = [2, 3, 4, 5, 6]

// The onboarding answer turned into a plan. What the goal changes is deliberately small and
// all of it is editable afterwards:
//   muscle     — the starter plan as it is (8–12 reps)
//   strength   — each day's first lift becomes 5×5, and rest goes to 150s
//   fat        — same lifts, rest down to 60s so the session stays dense
//   consistent — every day capped at four exercises, for sessions short enough to keep
// `weekdays` (the days someone picked) wins over `days` (a count with a fixed schedule).
// `kit` swaps lifts the equipment can't do; `prog` is the progression every routine starts on.
// Returns { routines, week, restSec } — restSec is null when the goal doesn't change it.
export function starterPlan({ goal = 'muscle', days = 3, weekdays = null, kit = 'gym', prog = null } = {}) {
  let sched
  if (weekdays && weekdays.length) {
    const picked = MON_FIRST.filter(d => weekdays.includes(d)).slice(0, 6)
    sched = Object.fromEntries(picked.map((d, i) => [d, SPLIT_FOR[picked.length][i]]))
  } else sched = SCHEDULES[days] || SCHEDULES[3]
  const specs = { push: SPEC[0], pull: SPEC[1], legs: SPEC[2], upper: UPPER, lower: LOWER, full: FULL }
  const swaps = KIT_SWAPS[kit] || {}
  const byKey = {}
  const week = {}
  Object.entries(sched).forEach(([wd, key]) => {
    if (!byKey[key]) {
      const [name, emoji, list] = specs[key]
      let ex = list
        .map(([id, sets, reps]) => [id in swaps ? swaps[id] : id, sets, reps])
        .filter(([id]) => id)
        .map(([id, sets, reps]) => ({ id, sets, reps, weight: 0 }))
      if (goal === 'strength') ex[0] = { ...ex[0], sets: 5, reps: 5 }
      if (goal === 'consistent') ex = ex.slice(0, 4)
      byKey[key] = { id: uid(), name, emoji, ex, ...(prog ? { prog } : {}) }
    }
    week[wd] = byKey[key].id
  })
  const restSec = goal === 'strength' ? 150 : goal === 'fat' ? 60 : null
  return { routines: Object.values(byKey), week, restSec }
}
