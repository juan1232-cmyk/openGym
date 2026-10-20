import { describe, it, expect } from 'vitest'
import { fixAction, applyFix, undoFix, fixDone, swapPending, sessionPlan, spendSwaps, MAX_SETS } from './liftfix.js'
import { liftsToWatch } from './stats.js'
import { nextPrescription } from './progression.js'
import { SCENARIOS } from '../device/scenarios.js'
import { isoOf } from './format.js'

const NOW = new Date('2026-09-23T09:00:00')
const DAY = 864e5
// the demo profiles hold the row at 60 × 5 for eight sessions — flat, with all three fixes
const ROW = '0027'
// a copy: every demo profile shares one routine object, and these tests change it
const stalled = () => JSON.parse(JSON.stringify(SCENARIOS.stalled.state(NOW)))
const fixesOf = (S, id = ROW) => liftsToWatch(S, NOW).find(x => x.id === id).fixes
const fix = (S, kind) => fixesOf(S).find(f => f.kind === kind)
const cfgOf = (S, id = ROW) => S.routines[0].ex.find(c => c.id === id)

describe('fixAction', () => {
  it('turns each of a flat lift\'s fixes into a change to the routine it is in', () => {
    const S = stalled()
    expect(fixAction(S, ROW, fix(S, 'sets'), NOW)).toEqual({ kind: 'sets', routines: [{ rid: 'demo', name: 'Full body', from: 3, to: 4 }] })
    const swap = fixAction(S, ROW, fix(S, 'swap'), NOW)
    expect(swap).toMatchObject({ kind: 'swap', from: ROW, to: fix(S, 'swap').alt })
    expect(fixAction(S, ROW, fix(S, 'deload'), NOW)).toEqual({ kind: 'deload', w: fix(S, 'deload').weight, until: '2026-09-29', routines: [{ rid: 'demo', name: 'Full body' }] })
  })

  it('has nothing to change for a lift that isn\'t in any routine', () => {
    const S = stalled()
    const f = fixesOf(S)
    S.routines[0].ex = S.routines[0].ex.filter(c => c.id !== ROW)
    expect(f.map(x => fixAction(S, ROW, x, NOW))).toEqual([null, null, null])
  })

  it('stops adding sets at the ceiling, and can\'t deload or swap without something to go to', () => {
    const S = stalled()
    cfgOf(S).sets = MAX_SETS
    expect(fixAction(S, ROW, fix(S, 'sets'), NOW)).toBeNull()
    expect(fixAction(S, ROW, { kind: 'swap', alt: null }, NOW)).toBeNull()
    expect(fixAction(S, ROW, { kind: 'deload', factor: 0.9, weight: null }, NOW)).toBeNull()
  })

  it('reaches every routine the lift is planned in', () => {
    const S = stalled()
    S.routines.push({ id: 'b', name: 'Pull', ex: [{ id: ROW, sets: 4, reps: 8 }] })
    expect(fixAction(S, ROW, fix(S, 'sets'), NOW).routines.map(r => [r.rid, r.from, r.to])).toEqual([['demo', 3, 4], ['b', 4, 5]])
  })
})

describe('applyFix / undoFix', () => {
  it('adds a set for good, and undo takes exactly that set back', () => {
    const S = stalled()
    applyFix(S, ROW, fix(S, 'sets'), NOW)
    expect(cfgOf(S).sets).toBe(4)
    expect(fixDone(S, ROW, 'sets')).toMatchObject({ kind: 'sets', d: isoOf(NOW) })
    expect(undoFix(S, ROW, 'sets')).toBe(true)
    expect(cfgOf(S).sets).toBe(3)
    expect(fixDone(S, ROW, 'sets')).toBeNull()
    expect(S.liftFixes[ROW]).toBeUndefined()
  })

  it('leaves a set count edited by hand since alone on undo', () => {
    const S = stalled()
    applyFix(S, ROW, fix(S, 'sets'), NOW)
    cfgOf(S).sets = 6
    undoFix(S, ROW, 'sets')
    expect(cfgOf(S).sets).toBe(6)
  })

  it('swaps for the next session only: the routine keeps the lift, that session does the alternative', () => {
    const S = stalled()
    const alt = fix(S, 'swap').alt
    const at = S.routines[0].ex.findIndex(c => c.id === ROW)
    applyFix(S, ROW, fix(S, 'swap'), NOW)
    expect(S.routines[0].ex[at]).toEqual({ id: ROW, sets: 3, reps: 5, swap: { to: alt } })
    expect(sessionPlan(S.routines[0])[at]).toEqual({ id: alt, sets: 3, reps: 5 })
    expect(swapPending(S, ROW)).toBe(true)
    // that session done: the marker is spent, the one after has the lift back
    spendSwaps(S, { routineId: 'demo', entries: [{ id: alt, sets: [{ w: 50, r: 8, done: true }] }] })
    expect(swapPending(S, ROW)).toBe(false)
    expect(sessionPlan(S.routines[0])[at]).toEqual({ id: ROW, sets: 3, reps: 5 })
    expect(fixDone(S, ROW, 'swap')).toBeTruthy()
  })

  it("keeps a swap waiting when its session didn't do the alternative", () => {
    const S = stalled()
    applyFix(S, ROW, fix(S, 'swap'), NOW)
    spendSwaps(S, { routineId: 'demo', entries: [{ id: fix(S, 'swap').alt, sets: [{ w: 50, r: 8, done: false }] }] })
    expect(swapPending(S, ROW)).toBe(true)
  })

  it('takes a waiting swap back on undo', () => {
    const S = stalled()
    applyFix(S, ROW, fix(S, 'swap'), NOW)
    undoFix(S, ROW, 'swap')
    expect(cfgOf(S)).toEqual({ id: ROW, sets: 3, reps: 5 })
    expect(fixDone(S, ROW, 'swap')).toBeNull()
  })

  it("doesn't carry a deload week over to the stand-in", () => {
    const S = stalled()
    applyFix(S, ROW, fix(S, 'deload'), NOW)
    applyFix(S, ROW, fix(S, 'swap'), NOW)
    expect(sessionPlan(S.routines[0]).find(c => c.id === fix(S, 'swap').alt).deload).toBeUndefined()
  })

  it('prescribes the deload weight for a week, then lets the policy take over again', () => {
    const S = stalled()
    const w = fix(S, 'deload').weight
    expect(nextPrescription(S, cfgOf(S), S.routines[0], NOW).weight).not.toBe(w)
    applyFix(S, ROW, fix(S, 'deload'), NOW)
    const during = nextPrescription(S, cfgOf(S), S.routines[0], new Date(NOW.getTime() + 6 * DAY))
    expect(during).toMatchObject({ kind: 'deload', weight: w })
    expect(nextPrescription(S, cfgOf(S), S.routines[0], new Date(NOW.getTime() + 7 * DAY)).kind).not.toBe('deload')
    undoFix(S, ROW, 'deload')
    expect(cfgOf(S).deload).toBeUndefined()
  })

  it('deloads even a lift with automatic progression off — it was asked for', () => {
    const S = stalled()
    cfgOf(S).prog = 'off'
    applyFix(S, ROW, fix(S, 'deload'), NOW)
    expect(nextPrescription(S, cfgOf(S), S.routines[0], NOW)).toMatchObject({ kind: 'deload', weight: fix(S, 'deload').weight })
  })

  it('touches nothing for a fix it can\'t act on', () => {
    const S = stalled()
    const before = JSON.stringify(S)
    expect(applyFix(S, ROW, { kind: 'swap', alt: null }, NOW)).toBeNull()
    expect(JSON.stringify(S)).toBe(before)
  })
})

describe('fixDone', () => {
  // one more session of the row, `days` after NOW, at the given weight
  const logRow = (S, days, w) => {
    const day = new Date(NOW.getTime() + days * DAY)
    S.workouts.push({ id: 'x' + days, d: isoOf(day), start: day.getTime(), entries: [{ id: ROW, sets: [{ w, r: 5, done: true }] }] })
  }

  it('stays done while the lift is still flat, so it isn\'t suggested again', () => {
    const S = stalled()
    applyFix(S, ROW, fix(S, 'sets'), NOW)
    logRow(S, 2, 60)
    expect(fixDone(S, ROW, 'sets')).toBeTruthy()
  })

  it('lapses once the lift sets a new best — a later stall is a new one', () => {
    const S = stalled()
    applyFix(S, ROW, fix(S, 'sets'), NOW)
    logRow(S, 2, 62.5)
    expect(fixDone(S, ROW, 'sets')).toBeNull()
  })

  it('drops a lapsed marker when the next fix for the lift is accepted', () => {
    const S = stalled()
    applyFix(S, ROW, fix(S, 'sets'), NOW)
    logRow(S, 2, 62.5)
    applyFix(S, ROW, { kind: 'deload', factor: 0.9, weight: 55 }, new Date(NOW.getTime() + 3 * DAY))
    expect(Object.keys(S.liftFixes[ROW])).toEqual(['deload'])
  })
})
