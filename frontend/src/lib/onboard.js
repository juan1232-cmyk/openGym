// What the onboarding asks, what Peek says back, and what each answer does to the profile.
// Pure — views/Onboarding.jsx and components/Tour.jsx only draw what comes out of here, so
// every line Peek says about an answer sits next to the effect it describes and can't drift.
import { starterPlan } from './starter.js'

// Each option: k (stored), name + sub (the card), line (what Peek says when you pick it —
// what it does in the app), mood (lib/orb-rig MOODS) and react (an orb-rig expression).
export const GOALS = [
  { k: 'muscle', name: 'Build muscle', sub: 'More volume, moderate weight', mood: 'excited', react: 'joyful-wide',
    line: 'When you add an exercise, I’ll suggest 6–8 reps on big lifts and 10–15 on the rest.', because: '6–8 reps on big lifts, 10–15 on the rest' },
  { k: 'strength', name: 'Get stronger', sub: 'Heavier lifts, lower reps', mood: 'proud', react: 'angry-brows',
    line: 'Big lifts get 5×5, and rests go to 2:30.', because: '5×5 on big lifts, rest 2:30' },
  { k: 'fat', name: 'Lose fat', sub: 'Denser sessions, shorter rest', mood: 'playful', react: 'playful-right',
    line: 'More reps, and the rest timer drops to 60 seconds.', because: 'Higher reps, rest timer 60 s' },
  { k: 'consistent', name: 'Stay consistent', sub: 'Short sessions, steady habit', mood: 'happy', react: 'joyful-down-right',
    line: 'I’ll keep it simple: 3 sets of 8–12 on everything.', because: '3 × 8–12 on everything' }
]
export const LEVELS = [
  { k: 'new', name: 'Just starting', sub: 'Under 6 months', mood: 'curious', react: 'surprised-wide-left',
    line: 'Hit every rep and I’ll add weight next time. Simple.', because: 'Linear: hit every rep, weight goes up' },
  { k: 'some', name: 'A year or so', sub: 'You know the main lifts', mood: 'happy', react: 'joyful-wide',
    line: 'You’ll climb a rep range first. Top it and I’ll tell you to add weight.', because: 'Double progression: top the range, then add weight' },
  { k: 'vet', name: 'Years', sub: 'Progress comes slowly now', mood: 'proud', react: 'far-right-glance',
    line: 'Rep ranges first, and I’ll call a deload when you stall.', because: 'Double progression, deload when you stall' }
]
export const KITS = [
  { k: 'gym', name: 'Full gym', sub: 'Barbells, cables, machines', mood: 'happy', react: 'joyful-wide',
    line: 'The exercise list will show everything.', because: 'Every exercise available' },
  { k: 'home', name: 'Dumbbells at home', sub: 'Dumbbells and a bench', mood: 'curious', react: 'curious-left',
    line: 'The exercise list will only show what you can do with dumbbells.', because: 'Exercise list: dumbbells and bodyweight' },
  { k: 'bodyweight', name: 'Just bodyweight', sub: 'A floor and a bar, maybe', mood: 'playful', react: 'playful-right',
    line: 'The exercise list will only show bodyweight moves.', because: 'Exercise list: bodyweight only' }
]
export const MODES = [
  { k: 'own', name: 'I’ll make my own', sub: 'Start empty. I’ll show you where.', mood: 'happy', react: 'joyful-down-right',
    line: 'Good. I’ll show you where to start in a second.' },
  { k: 'you', name: 'You make it', sub: 'Built from your answers. Change anything later.', mood: 'excited', react: 'joyful-wide',
    line: 'On it. I’ll use everything you told me.' }
]

// What a skipped question falls back to — the same as the app did before anyone was asked.
export const DEFAULTS = { goal: 'muscle', level: 'some', kit: 'gym' }
export const MAX_DAYS = 6
export const MON_FIRST = [1, 2, 3, 4, 5, 6, 0]

// The equipment filter (S.gymEq, dataset `eq` names) for a kit. null = everything; bodyweight
// moves are always allowed (pick.js gymAllows), so [] means bodyweight only.
export const gymEqFor = kit => (kit === 'home' ? ['dumbbell'] : kit === 'bodyweight' ? [] : null)
// The progression a new routine starts on (lib/progression.js policies).
export const progFor = level => (level === 'new' ? 'linear' : 'double')
// The rest timer a goal sets; null leaves the setting alone.
export const restFor = goal => (goal === 'strength' ? 150 : goal === 'fat' ? 60 : null)

// Fills in what was skipped, so everything below can assume a full set of answers.
export function withDefaults(a) {
  return { ...a, goal: a.goal || DEFAULTS.goal, level: a.level || DEFAULTS.level, kit: a.kit || DEFAULTS.kit, weekdays: a.weekdays || [] }
}

// The plan Peek would build ("You make it"), or null for someone making their own.
export function planFor(answers) {
  const a = withDefaults(answers)
  if (a.mode !== 'you' || !a.weekdays.length) return null
  return starterPlan({ goal: a.goal, weekdays: a.weekdays, kit: a.kit, prog: progFor(a.level) })
}

// The one mutation the onboarding makes, run through the store's update() so the server push
// fires like any other change. `plan` is planFor's result, passed in so the routines committed
// are the ones that were shown (their ids are random).
export function commitAnswers(s, answers, plan = planFor(answers)) {
  const a = withDefaults(answers)
  if (a.name && a.name.trim()) s.name = a.name.trim()
  s.goal = a.goal
  s.level = a.level
  s.kit = a.kit
  s.gymEq = gymEqFor(a.kit)
  s.progDefault = progFor(a.level)
  s.trainDays = MON_FIRST.filter(d => a.weekdays.includes(d))
  s.days = s.trainDays.length || null
  if (a.unit) s.unit = a.unit
  const rest = restFor(a.goal)
  if (rest) s.restSec = rest
  if (plan) {
    s.routines.push(...plan.routines)
    Object.assign(s.week, plan.week)
  }
  s.toured = false
}

// The "Because you said" card under a plan Peek built: each answer next to what it did, as
// translatable templates ([template, ...args]).
export function becauseRows(answers) {
  const a = withDefaults(answers)
  const g = GOALS.find(x => x.k === a.goal), l = LEVELS.find(x => x.k === a.level), k = KITS.find(x => x.k === a.kit)
  const n = a.weekdays.length
  return [
    { said: [g.name], did: [g.because] },
    { said: [l.name], did: [l.because] },
    { said: [k.name], did: [k.because] },
    { said: n === 1 ? ['1 day a week'] : ['{0} days a week', n], did: n === 1 ? ['One full-body day'] : ['A routine on each of those days'] }
  ]
}

// The tour, stop by stop. look: read it, tap anywhere. do: tap the spotlit control and it
// navigates for real (to). `target` is a [data-tour] value; `own` swaps the line for someone
// who chose to build their own plan. The Start tab goes to the start screen, never startFlow,
// so the tour can't begin a real session.
export const TOUR = [
  { kind: 'look', seg: 0, target: 'coach', at: '/home',
    line: 'This is my spot. Every time you open the app I’ll tell you how you’re doing.' },
  { kind: 'do', seg: 1, target: 'tab-plan', to: '/plan', line: 'Tap Plan.' },
  { kind: 'look', seg: 1, target: 'plan-main', at: '/plan',
    line: 'Your week. Tap any day to give it a routine, or open one to change it.',
    own: 'Your plan lives here. Tap New routine to make your first one.' },
  { kind: 'do', seg: 2, target: 'tab-stats', to: '/stats', line: 'Now Stats.' },
  { kind: 'look', seg: 2, target: 'stats-main', at: '/stats', line: 'Every PR and every set you log ends up here.' },
  { kind: 'do', seg: 3, target: 'tab-start', to: '/workout', line: 'Last one. At the gym, tap Start.' },
  { kind: 'end', seg: 3, at: '/workout', line: 'That’s it. Go lift, {0}.' }
]
export const TOUR_SEGS = 4

// How full each progress segment is with stop `idx` showing: the share of that segment's
// stops reached so far.
export function tourProgress(idx) {
  return Array.from({ length: TOUR_SEGS }, (_, s) => {
    const mine = TOUR.map((st, j) => [st, j]).filter(([st]) => st.seg === s)
    return mine.filter(([, j]) => j <= idx).length / mine.length
  })
}
