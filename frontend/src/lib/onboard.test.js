import { describe, it, expect } from 'vitest'
import { GOALS, LEVELS, KITS, MODES, gymEqFor, progFor, restFor, withDefaults, planFor, commitAnswers, becauseRows, TOUR, tourProgress, TOUR_SEGS } from './onboard.js'
import { EXIDX } from './exercises.js'
import { gymAllows } from './pick.js'
import { suggestScheme } from './scheme.js'
import { EX } from './orb-rig.js'

const blank = () => ({ unit: 'kg', restSec: 90, gymEq: null, routines: [], week: {}, goal: null, toured: true })

describe('onboarding answers', () => {
  it('maps each kit to the equipment filter the picker reads', () => {
    expect(gymEqFor('gym')).toBeNull()
    expect(gymEqFor('home')).toEqual(['dumbbell'])
    expect(gymEqFor('bodyweight')).toEqual([])
    // bodyweight moves stay available in every kit
    expect(gymAllows(EXIDX['0662'], gymEqFor('bodyweight'))).toBe(true)
    expect(gymAllows(EXIDX['0025'], gymEqFor('home'))).toBe(false)
  })

  it('starts beginners on linear progression and everyone else on double', () => {
    expect(progFor('new')).toBe('linear')
    expect(progFor('some')).toBe('double')
    expect(progFor('vet')).toBe('double')
  })

  it('changes rest only for the goals that say they do', () => {
    expect(restFor('strength')).toBe(150)
    expect(restFor('fat')).toBe(60)
    expect(restFor('muscle')).toBeNull()
    expect(restFor('consistent')).toBeNull()
  })

  it('says what the scheme suggestions really are for each goal', () => {
    // the lines quote these numbers; if lib/scheme.js changes, so must the lines
    const bench = EXIDX['0025'], raise = EXIDX['0334']
    expect(suggestScheme('muscle', bench)).toMatchObject({ lo: 6, hi: 8 })
    expect(suggestScheme('muscle', raise)).toMatchObject({ lo: 10, hi: 15 })
    expect(suggestScheme('strength', bench)).toMatchObject({ sets: 5, lo: 5, hi: 5 })
    expect(suggestScheme('consistent', bench)).toMatchObject({ sets: 3, lo: 8, hi: 12 })
  })

  it('fills skipped questions with the defaults the app used before', () => {
    expect(withDefaults({})).toMatchObject({ goal: 'muscle', level: 'some', kit: 'gym', weekdays: [] })
  })

  it('only uses expressions and moods the orb knows', () => {
    ;[...GOALS, ...LEVELS, ...KITS, ...MODES].forEach(o => expect(EX[o.react]).toBeTruthy())
  })
})

describe('commitAnswers', () => {
  it('builds nothing for someone making their own plan, but keeps every answer', () => {
    const s = blank()
    commitAnswers(s, { name: ' Juan ', goal: 'strength', level: 'new', kit: 'home', weekdays: [5, 1, 3], unit: 'lb', mode: 'own' })
    expect(s.routines).toEqual([])
    expect(s).toMatchObject({ name: 'Juan', goal: 'strength', level: 'new', kit: 'home', gymEq: ['dumbbell'], progDefault: 'linear',
      trainDays: [1, 3, 5], days: 3, unit: 'lb', restSec: 150, toured: false })
  })

  it('commits the plan Peek showed, on exactly the picked days', () => {
    const answers = { goal: 'muscle', level: 'some', kit: 'gym', weekdays: [2, 4, 6], mode: 'you' }
    const plan = planFor(answers)
    const s = blank()
    commitAnswers(s, answers, plan)
    expect(s.routines.map(r => r.id)).toEqual(plan.routines.map(r => r.id))
    expect(Object.keys(s.week).map(Number).sort()).toEqual([2, 4, 6])
    s.routines.forEach(r => expect(r.prog).toBe('double'))
  })

  it('leaves rest alone for a goal that does not change it, and works with no name', () => {
    const s = blank()
    commitAnswers(s, { goal: 'muscle', weekdays: [1] })
    expect(s.restSec).toBe(90)
    expect(s.name).toBeUndefined()
    expect(s.goal).toBe('muscle')
  })

  it('has no plan to build without picked days or when making your own', () => {
    expect(planFor({ mode: 'you', weekdays: [] })).toBeNull()
    expect(planFor({ mode: 'own', weekdays: [1, 3] })).toBeNull()
  })

  it('explains every answer under the plan', () => {
    const rows = becauseRows({ goal: 'fat', level: 'vet', kit: 'bodyweight', weekdays: [1, 4] })
    expect(rows).toHaveLength(4)
    expect(rows[3].said).toEqual(['{0} days a week', 2])
    expect(becauseRows({ weekdays: [1] })[3].did).toEqual(['One full-body day'])
  })
})

describe('the tour', () => {
  it('alternates do stops with what they lead to, and ends on the start screen', () => {
    TOUR.forEach((st, i) => {
      if (st.kind === 'do') {
        expect(st.target).toMatch(/^tab-/)
        expect(TOUR[i + 1].at).toBe(st.to)
      }
    })
    expect(TOUR.at(-1)).toMatchObject({ kind: 'end', at: '/workout' })
    expect(TOUR.find(s => s.target === 'tab-start').to).toBe('/workout')
  })

  it('fills the progress bar segment by segment and ends full', () => {
    expect(tourProgress(0)).toEqual([1, 0, 0, 0])
    expect(tourProgress(1)).toEqual([1, 0.5, 0, 0])
    expect(tourProgress(TOUR.length - 1)).toEqual(Array(TOUR_SEGS).fill(1))
  })
})
