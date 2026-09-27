import { describe, it, expect } from 'vitest'
import { progressSeries, trendPer14 } from './progress.js'
import { EXDB } from './exercises.js'

const LIFT = EXDB.find(e => e.bp !== 'cardio' && e.eq !== 'body weight').id
const BW = EXDB.find(e => e.eq === 'body weight').id
const CARDIO = EXDB.find(e => e.bp === 'cardio').id
const DAY = 86400000
const T0 = new Date('2026-08-03T10:00:00').getTime()

const workout = (i, id, sets, target = {}) => ({
  id: 'w' + i, d: new Date(T0 + i * 7 * DAY).toISOString().slice(0, 10), start: T0 + i * 7 * DAY,
  entries: [{ id, target, sets: sets.map(s => ({ done: true, ...s })) }]
})

describe('progressSeries', () => {
  it('charts the estimated 1RM for a loaded lift, oldest first', () => {
    const S = { workouts: [workout(0, LIFT, [{ w: 60, r: 8 }]), workout(1, LIFT, [{ w: 62.5, r: 8 }, { w: 50, r: 10 }])] }
    const p = progressSeries(S, LIFT)
    expect(p.kind).toBe('e1rm')
    expect(p.points.map(x => x.y)).toEqual([76, 79.2])
    expect(p.top.map(x => x.y)).toEqual([60, 62.5])
  })

  it('falls back to top weight when every set is past the 1RM rep cap', () => {
    const S = { workouts: [workout(0, LIFT, [{ w: 40, r: 15 }]), workout(1, LIFT, [{ w: 42.5, r: 15 }])] }
    const p = progressSeries(S, LIFT)
    expect(p.kind).toBe('weight')
    expect(p.points.map(x => x.y)).toEqual([40, 42.5])
  })

  it('charts reps for unloaded bodyweight work', () => {
    const S = { workouts: [workout(0, BW, [{ w: 0, r: 10 }, { w: 0, r: 12 }], { bodyweight: true })] }
    const p = progressSeries(S, BW)
    expect(p.kind).toBe('reps')
    expect(p.points.map(x => x.y)).toEqual([12])
    expect(p.top).toEqual([])
  })

  it('charts holds and cardio in their own units', () => {
    const hold = { workouts: [workout(0, LIFT, [{ sec: 40 }, { sec: 45 }], { mode: 'time' })] }
    expect(progressSeries(hold, LIFT)).toMatchObject({ kind: 'sec', points: [{ y: 45 }] })
    const run = { workouts: [workout(0, CARDIO, [{ min: 20, speed: 9.5 }])] }
    expect(progressSeries(run, CARDIO)).toMatchObject({ kind: 'speed', points: [{ y: 9.5 }] })
  })

  it('ignores unchecked sets and other exercises', () => {
    const S = { workouts: [workout(0, LIFT, [{ w: 100, r: 5, done: false }]), workout(1, BW, [{ r: 10 }])] }
    expect(progressSeries(S, LIFT).points).toEqual([])
  })
})

describe('trendPer14', () => {
  const pts = ys => ys.map((y, i) => ({ t: T0 + i * 7 * DAY, y }))

  it('reads a steady weekly gain as change per two weeks', () => {
    expect(trendPer14(pts([60, 61.25, 62.5, 63.75]))).toBeCloseTo(2.5, 6)
  })

  it('is negative for a decline and zero when flat', () => {
    expect(trendPer14(pts([60, 59, 58]))).toBeCloseTo(-2, 6)
    expect(trendPer14(pts([60, 60, 60]))).toBeCloseTo(0, 6)
  })

  it('refuses to call two sessions, or a few days, a trend', () => {
    expect(trendPer14(pts([60, 70]))).toBeNull()
    expect(trendPer14([{ t: T0, y: 1 }, { t: T0 + DAY, y: 2 }, { t: T0 + 2 * DAY, y: 3 }])).toBeNull()
    expect(trendPer14(null)).toBeNull()
  })
})
