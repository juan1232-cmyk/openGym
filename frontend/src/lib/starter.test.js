import { describe, it, expect } from 'vitest'
import { starterPlan, DAY_OPTIONS, GOALS, KITS } from './starter.js'
import { EXIDX } from './exercises.js'
import { gymAllows } from './pick.js'
import { gymEqFor } from './onboard.js'

const trainingDays = p => Object.keys(p.week).length

describe('starterPlan', () => {
  it('schedules exactly the number of days asked for, every one pointing at a real routine', () => {
    DAY_OPTIONS.forEach(days => {
      const p = starterPlan({ goal: 'muscle', days })
      expect(trainingDays(p)).toBe(days)
      Object.values(p.week).forEach(id => expect(p.routines.some(r => r.id === id)).toBe(true))
    })
  })

  it('never schedules Sunday and never leaves a routine unscheduled', () => {
    DAY_OPTIONS.forEach(days => {
      const p = starterPlan({ days })
      expect(p.week[0]).toBeUndefined()
      p.routines.forEach(r => expect(Object.values(p.week)).toContain(r.id))
    })
  })

  it('reuses one routine for a split that repeats in the week instead of cloning it', () => {
    const p = starterPlan({ days: 6 })
    expect(p.routines.map(r => r.name)).toEqual(['Push Day', 'Pull Day', 'Leg Day'])
    expect(p.week[1]).toBe(p.week[4])
    expect(starterPlan({ days: 4 }).routines).toHaveLength(2)
  })

  it('makes each day\'s first lift 5×5 and lengthens rest for strength, and touches nothing else', () => {
    const base = starterPlan({ goal: 'muscle', days: 3 })
    const str = starterPlan({ goal: 'strength', days: 3 })
    str.routines.forEach((r, i) => {
      expect(r.ex[0]).toMatchObject({ sets: 5, reps: 5 })
      expect(r.ex.slice(1)).toEqual(base.routines[i].ex.slice(1))
    })
    expect(str.restSec).toBe(150)
  })

  it('shortens rest for fat loss and keeps the lifts', () => {
    const p = starterPlan({ goal: 'fat', days: 3 })
    expect(p.restSec).toBe(60)
    expect(p.routines.map(r => r.ex)).toEqual(starterPlan({ goal: 'muscle', days: 3 }).routines.map(r => r.ex))
  })

  it('caps every day at four exercises for consistency', () => {
    starterPlan({ goal: 'consistent', days: 5 }).routines.forEach(r => expect(r.ex.length).toBeLessThanOrEqual(4))
  })

  it('leaves the rest setting alone for goals that do not change it', () => {
    expect(starterPlan({ goal: 'muscle' }).restSec).toBeNull()
    expect(starterPlan({ goal: 'consistent' }).restSec).toBeNull()
  })

  it('falls back to three days for a count it has no schedule for', () => {
    expect(trainingDays(starterPlan({ days: 9 }))).toBe(3)
  })

  it('knows every goal it offers', () => {
    GOALS.forEach(goal => expect(starterPlan({ goal }).routines.length).toBeGreaterThan(0))
  })

  it('puts a routine on exactly the weekdays picked, Monday first, and rests the others', () => {
    for (let n = 1; n <= 6; n++) {
      const picked = [0, 6, 5, 4, 3, 2, 1].slice(0, n)
      const p = starterPlan({ weekdays: picked })
      expect(Object.keys(p.week).map(Number).sort()).toEqual([...picked].sort())
      p.routines.forEach(r => expect(Object.values(p.week)).toContain(r.id))
    }
    const tts = starterPlan({ weekdays: [6, 2, 4] })
    expect([2, 4, 6].map(d => tts.routines.find(r => r.id === tts.week[d]).name)).toEqual(['Push Day', 'Pull Day', 'Leg Day'])
    expect(starterPlan({ weekdays: [3] }).routines.map(r => r.name)).toEqual(['Full Body'])
  })

  it('swaps every lift to one the kit can do, all of them real exercises', () => {
    KITS.forEach(kit => {
      for (let n = 1; n <= 6; n++) {
        starterPlan({ weekdays: [1, 2, 3, 4, 5, 6].slice(0, n), kit }).routines.forEach(r => {
          expect(r.ex.length).toBeGreaterThan(0)
          r.ex.forEach(e => {
            expect(EXIDX[e.id], `${kit} ${e.id}`).toBeTruthy()
            expect(gymAllows(EXIDX[e.id], gymEqFor(kit)), `${kit} ${EXIDX[e.id].n}`).toBe(true)
          })
          expect(new Set(r.ex.map(e => e.id)).size).toBe(r.ex.length)
        })
      }
    })
  })

  it('keeps the strength 5×5 on the first lift after a swap, and sets the progression asked for', () => {
    const p = starterPlan({ goal: 'strength', days: 3, kit: 'bodyweight', prog: 'linear' })
    p.routines.forEach(r => {
      expect(r.ex[0]).toMatchObject({ sets: 5, reps: 5 })
      expect(r.prog).toBe('linear')
    })
    expect(starterPlan({ days: 3 }).routines[0].prog).toBeUndefined()
  })
})
