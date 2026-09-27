import { describe, it, expect } from 'vitest'
import { starterPlan, DAY_OPTIONS, GOALS } from './starter.js'

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
})
