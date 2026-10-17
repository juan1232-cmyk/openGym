import { describe, it, expect } from 'vitest'
import { musclesOf, loadOfWorkouts, loadOfActive, loadOfRoutine, overSessionCap } from './muscles.js'
import { EXIDX } from './exercises.js'

const BENCH = '0025'   // barbell bench press: chest, helped by triceps and shoulders
const sets = (n, s) => Array.from({ length: n }, () => ({ w: 60, r: 8, done: true, ...s }))

describe('musclesOf', () => {
  it('counts a helper muscle half', () => {
    expect(musclesOf(EXIDX[BENCH])).toEqual({ chest: 1, triceps: 0.5, deltoids: 0.5 })
  })
})

describe('effective sets', () => {
  // the doc's worked example
  it('reads bench 3×8 at RIR 2 as 2.7 sets of chest and 1.35 of triceps', () => {
    const load = loadOfWorkouts([{ entries: [{ id: BENCH, sets: sets(3, { rir: 2 }) }] }])
    expect(load.chest).toBeCloseTo(2.7)
    expect(load.triceps).toBeCloseTo(1.35)
  })

  it('counts unrated sets in full', () => {
    expect(loadOfWorkouts([{ entries: [{ id: BENCH, sets: sets(3) }] }]).chest).toBe(3)
  })

  it('skips sets not ticked off', () => {
    const load = loadOfActive({ entries: [{ id: BENCH, sets: [...sets(2, { rir: 0 }), { w: 60, r: 8, rir: 0, done: false }] }] })
    expect(load.chest).toBe(2)
  })

  it('still narrows to the sets `pick` keeps', () => {
    const load = loadOfWorkouts([{ entries: [{ id: BENCH, sets: [...sets(2, { rir: 1 }), ...sets(2, { rir: 4 })] }] }], s => s.rir <= 3)
    expect(load.chest).toBe(2)
  })

  it('leaves a routine as a planned count — a plan has no effort yet', () => {
    expect(loadOfRoutine({ ex: [{ id: BENCH, sets: 3 }] }).chest).toBe(3)
  })
})

describe('overSessionCap', () => {
  const active = n => ({ entries: [{ id: BENCH, sets: sets(n, { rir: 1 }) }] })

  it('flags a muscle only once it passes the cap', () => {
    expect(overSessionCap(active(11), 11)).toEqual([])
    expect(overSessionCap(active(12), 11)).toEqual(['chest'])
  })

  it('counts effective sets, so easy sets take longer to get there', () => {
    expect(overSessionCap({ entries: [{ id: BENCH, sets: sets(14, { rir: 4 }) }] }, 11)).toEqual([])
  })

  it('leaves out muscles already flagged this workout', () => {
    expect(overSessionCap(active(12), 11, ['chest'])).toEqual([])
  })
})
