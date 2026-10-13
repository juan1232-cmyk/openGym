import { describe, it, expect } from 'vitest'
import {
  rangeBounds, prevBounds, inRange, adherence, buckets, bucketBy, weeksTrained, bestRun,
  personalBests, mainLift, AREAS, areaSets
} from './stats.js'
import { MUSCLES } from './muscles.js'
import { EXDB } from './exercises.js'

// Wednesday 23 Sep 2026
const TODAY = new Date('2026-09-23T09:00:00')
const LIFT = EXDB.find(e => e.bp !== 'cardio' && e.eq !== 'body weight').id
const BW = EXDB.find(e => e.eq === 'body weight').id
const set = (w, r) => ({ w, r, done: true })
const wo = (d, entries = [], extra = {}) => ({ id: d, d, vol: 100, start: 0, end: 0, entries, ...extra })

describe('rangeBounds / prevBounds', () => {
  it('reads the week as Monday to today', () => {
    expect(rangeBounds(7, TODAY)).toEqual({ from: '2026-09-21', to: '2026-09-23' })
  })

  it('reads N days as the last N days, today included', () => {
    expect(rangeBounds(30, TODAY)).toEqual({ from: '2026-08-25', to: '2026-09-23' })
  })

  it('starts all time at the first workout', () => {
    expect(rangeBounds(0, TODAY, [wo('2026-03-02'), wo('2025-11-10')]).from).toBe('2025-11-10')
  })

  it('compares a part-done week with the same weekdays of last week, not the days just before it', () => {
    expect(prevBounds(rangeBounds(7, TODAY), 7)).toEqual({ from: '2026-09-14', to: '2026-09-16' })
  })

  it('compares N days with the N days before, and all time with nothing', () => {
    expect(prevBounds(rangeBounds(30, TODAY), 30)).toEqual({ from: '2026-07-26', to: '2026-08-24' })
    expect(prevBounds(rangeBounds(0, TODAY, [wo('2026-01-01')]), 0)).toBeNull()
  })
})

describe('adherence', () => {
  // Mon / Wed / Fri plan
  const S = (workouts) => ({ workouts, dayPlan: {}, routines: [{ id: 'r' }], week: { 1: 'r', 3: 'r', 5: 'r' } })

  it('counts distinct days trained against days planned so far', () => {
    const a = adherence(S([wo('2026-09-15'), wo('2026-09-21'), wo('2026-09-21')]), rangeBounds(7, TODAY))
    expect(a).toEqual({ done: 1, planned: 2 })
  })

  it('does not count planned days from before the first workout', () => {
    const a = adherence(S([wo('2026-09-21')]), rangeBounds(30, TODAY))
    expect(a.planned).toBe(2)
  })

  it('a rest-day override takes a planned day out', () => {
    const s = S([wo('2026-09-14')]); s.dayPlan['2026-09-23'] = 'rest'
    expect(adherence(s, rangeBounds(7, TODAY)).planned).toBe(1)
  })
})

describe('buckets', () => {
  it('splits a week into seven days, the ones ahead empty', () => {
    const b = buckets([wo('2026-09-21'), wo('2026-09-23')], rangeBounds(7, TODAY), 'day')
    expect(b).toHaveLength(7)
    expect(b.map(x => x.n)).toEqual([1, 0, 1, 0, 0, 0, 0])
  })

  it('sums volume and minutes per bucket and ignores workouts outside the range', () => {
    const ws = [wo('2026-09-21', [], { start: 0, end: 30 * 60000, vol: 500 }), wo('2026-01-01', [], { vol: 999 })]
    const b = buckets(ws, rangeBounds(30, TODAY), 'week')
    expect(b.reduce((n, x) => n + x.vol, 0)).toBe(500)
    expect(b.reduce((n, x) => n + x.min, 0)).toBe(30)
  })

  it('picks days, weeks or months by range', () => {
    expect([7, 30, 90, 365, 0].map(bucketBy)).toEqual(['day', 'week', 'week', 'month', 'month'])
  })
})

describe('weeksTrained / bestRun', () => {
  it('marks each of the last n weeks, oldest first, ending with this one', () => {
    const w = weeksTrained([wo('2026-09-22'), wo('2026-09-08')], 3, TODAY)
    expect(w.map(x => x.on)).toEqual([true, false, true])
  })

  it('finds the longest run', () => {
    expect(bestRun([true, true, false, true, true, true, false].map(on => ({ on })))).toBe(3)
    expect(bestRun([])).toBe(0)
  })
})

describe('personalBests', () => {
  it('lists records in the range newest first, with the set they were set with', () => {
    const S = { workouts: [
      wo('2026-09-15', [{ id: LIFT, sets: [set(80, 5), set(82.5, 3)] }], { prs: [LIFT] }),
      wo('2026-09-22', [{ id: LIFT, sets: [set(85, 2)] }, { id: BW, sets: [set(10, 6)] }], { prs: [LIFT, BW] }),
      wo('2026-01-05', [{ id: LIFT, sets: [set(60, 5)] }], { prs: [LIFT] }),
    ] }
    const p = personalBests(S, rangeBounds(30, TODAY))
    expect(p.map(x => [x.d, x.w, x.r])).toEqual([['2026-09-22', 85, 2], ['2026-09-22', 10, 6], ['2026-09-15', 82.5, 3]])
    expect(p.find(x => x.id === BW).bw).toBe(true)
    expect(p.find(x => x.id === LIFT).bw).toBe(false)
  })
})

describe('mainLift', () => {
  it('follows the most-trained lift with an estimate and reports how far it moved', () => {
    const S = { workouts: [
      wo('2026-09-01', [{ id: LIFT, sets: [set(100, 1)] }]),
      wo('2026-09-20', [{ id: LIFT, sets: [set(110, 1)] }]),
      wo('2026-09-21', [{ id: BW, sets: [{ r: 10, done: true }] }]),
    ] }
    const m = mainLift(S, rangeBounds(30, TODAY))
    expect(m.id).toBe(LIFT)
    expect(m.now).toBe(110)
    expect(m.delta).toBe(10)
    expect(m.since).toBe('2026-09-01')
  })

  it('is null when nothing in the range yields an estimate', () => {
    expect(mainLift({ workouts: [] }, rangeBounds(30, TODAY))).toBeNull()
  })
})

describe('AREAS', () => {
  it('puts every drawable muscle in exactly one area', () => {
    const all = AREAS.flatMap(([, ms]) => ms)
    expect([...all].sort()).toEqual([...MUSCLES].sort())
  })

  it('sums sets per area', () => {
    const a = areaSets({ biceps: 3, triceps: 2.5, chest: 4 })
    expect(a.find(x => x.area === 'Arms').sets).toBe(5.5)
    expect(a.find(x => x.area === 'Chest').sets).toBe(4)
    expect(a.find(x => x.area === 'Legs').sets).toBe(0)
  })
})
