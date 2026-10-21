import { describe, it, expect } from 'vitest'
import { fixAction, applyFix, undoFix, fixDone, swapPending, sessionPlan, spendSwaps, MAX_SETS } from './liftfix.js'
import { liftsToWatch } from './stats.js'
import { nextPrescription } from './progression.js'
import { SCENARIOS } from '../device/scenarios.js'
import { isoOf } from './format.js'

const NOW = new Date('2026-09-23T09:00:00')
const DAY = 864e5
const later = days => new Date(NOW.getTime() + days * DAY)
// the demo profiles hold the row at 60 × 5 for eight sessions — flat — and in "stalled" miss
// bench and squat every time — stuck
const ROW = '0027', BENCH = '0025'
// a copy: every demo profile shares one routine object, and these tests change it
const stalled = () => JSON.parse(JSON.stringify(SCENARIOS.stalled.state(NOW)))
const fixesOf = (S, id = ROW, now = NOW) => liftsToWatch(S, now).find(x => x.id === id).fixes
const fix = (S, kind, id = ROW) => fixesOf(S, id).find(f => f.kind === kind)
const cfgOf = (S, id = ROW) => S.routines[0].ex.find(c => c.id === id)
// one finished session of the given lifts, `days` after NOW
const logSession = (S, days, entries) => {
  const d = later(days)
  const w = { id: 'x' + days, d: isoOf(d), start: d.getTime(), routineId: 'demo', entries: entries.map(([id, w, r = 5]) => ({ id, sets: [{ w, r, done: true }] })) }
  S.workouts.push(w)
  return w
}

describe('fixAction', () => {
  it('turns each fix into a change to the routine the lift is in', () => {
    const S = stalled()
    expect(fixAction(S, ROW, fix(S, 'sets'), NOW)).toEqual({ kind: 'sets', routines: [{ rid: 'demo', name: 'Full body', from: 3, to: 4 }] })
    expect(fixAction(S, ROW, fix(S, 'steps'), NOW)).toMatchObject({ kind: 'steps', routines: [{ from: 5, to: 2.5 }] })
    expect(fixAction(S, ROW, fix(S, 'swap'), NOW)).toMatchObject({ kind: 'swap', from: ROW, to: fix(S, 'swap').alts[0] })
    expect(fixAction(S, ROW, fix(S, 'deload'), NOW)).toEqual({ kind: 'deload', w: fix(S, 'deload').weight, until: '2026-09-29', routines: [{ rid: 'demo', name: 'Full body' }] })
    expect(fixAction(S, BENCH, fix(S, 'double', BENCH), NOW)).toMatchObject({ kind: 'double', routines: [{ low: 5, high: 8 }] })
  })

  it('has nothing to change for a lift that isn\'t in any routine', () => {
    const S = stalled()
    const f = fixesOf(S)
    S.routines[0].ex = S.routines[0].ex.filter(c => c.id !== ROW)
    expect(f.map(x => fixAction(S, ROW, x, NOW))).toEqual(f.map(() => null))
  })

  it('knows when a fix can\'t be done: at the set ceiling, on the smallest step, already on double, nothing to deload', () => {
    const S = stalled()
    cfgOf(S).sets = MAX_SETS
    expect(fixAction(S, ROW, fix(S, 'sets'), NOW)).toBeNull()
    cfgOf(S, BENCH).inc = 1.25
    expect(fixAction(S, BENCH, fix(S, 'steps', BENCH), NOW)).toBeNull()
    cfgOf(S, BENCH).prog = 'double'
    expect(fixAction(S, BENCH, fix(S, 'double', BENCH), NOW)).toBeNull()
    cfgOf(S).prog = 'off'
    expect(fixAction(S, ROW, fix(S, 'steps'), NOW)).toBeNull()
    expect(fixAction(S, ROW, { kind: 'deload', factor: 0.9, weight: null }, NOW)).toBeNull()
    expect(fixAction(S, ROW, { kind: 'swap', alt: null, alts: [] }, NOW)).toBeNull()
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
    expect(fixDone(S, ROW, 'sets', NOW)).toMatchObject({ kind: 'sets', d: isoOf(NOW) })
    expect(undoFix(S, ROW, 'sets')).toBe(true)
    expect(cfgOf(S).sets).toBe(3)
    expect(fixDone(S, ROW, 'sets', NOW)).toBeNull()
    expect(S.liftFixes[ROW]).toBeUndefined()
  })

  it('leaves a setting edited by hand since alone on undo', () => {
    const S = stalled()
    applyFix(S, ROW, fix(S, 'sets'), NOW)
    cfgOf(S).sets = 6
    undoFix(S, ROW, 'sets')
    expect(cfgOf(S).sets).toBe(6)
  })

  it('halves the step, and the policy then goes up by it; undo goes back to the default', () => {
    const S = stalled()
    applyFix(S, ROW, fix(S, 'steps'), NOW)
    expect(cfgOf(S).inc).toBe(2.5)
    expect(nextPrescription(S, cfgOf(S), S.routines[0], NOW)).toMatchObject({ kind: 'up', weight: 62.5 })
    undoFix(S, ROW, 'steps')
    expect(cfgOf(S)).toEqual({ id: ROW, sets: 3, reps: 5 })
  })

  it('switches a stuck lift to double progression from its reps now, and back on undo', () => {
    const S = stalled()
    applyFix(S, BENCH, fix(S, 'double', BENCH), NOW)
    expect(cfgOf(S, BENCH)).toEqual({ id: BENCH, sets: 3, reps: 8, repsMin: 5, prog: 'double' })
    // eight misses in a row are a stall under double progression too, so it backs off first
    // and then works up through 5–8 reps before the weight goes up again
    expect(nextPrescription(S, cfgOf(S, BENCH), S.routines[0], NOW)).toMatchObject({ policy: 'double', kind: 'deload', weight: 62.5, reps: 5 })
    undoFix(S, BENCH, 'double')
    expect(cfgOf(S, BENCH)).toEqual({ id: BENCH, sets: 3, reps: 5 })
  })

  it('prescribes the deload weight for a week, then lets the policy take over again', () => {
    const S = stalled()
    const w = fix(S, 'deload').weight
    expect(nextPrescription(S, cfgOf(S), S.routines[0], NOW).weight).not.toBe(w)
    applyFix(S, ROW, fix(S, 'deload'), NOW)
    expect(nextPrescription(S, cfgOf(S), S.routines[0], later(6))).toMatchObject({ kind: 'deload', weight: w })
    expect(nextPrescription(S, cfgOf(S), S.routines[0], later(7)).kind).not.toBe('deload')
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
    expect(applyFix(S, ROW, { kind: 'swap', alt: null, alts: [] }, NOW)).toBeNull()
    expect(JSON.stringify(S)).toBe(before)
  })
})

describe('the swap: a week on a variant, then the lift again', () => {
  it('does the variant from the next session until a week after it, then the lift is back', () => {
    const S = stalled()
    const alt = fix(S, 'swap').alts[0]
    const at = S.routines[0].ex.findIndex(c => c.id === ROW)
    applyFix(S, ROW, fix(S, 'swap'), NOW)
    // the routine keeps the lift; the next session does the variant in its place
    expect(cfgOf(S)).toEqual({ id: ROW, sets: 3, reps: 5, swap: { to: alt } })
    expect(sessionPlan(S.routines[0], NOW)[at]).toEqual({ id: alt, sets: 3, reps: 5 })
    // week 2: first session with the variant on day 2, another on day 6 — both the variant
    spendSwaps(S, logSession(S, 2, [[alt, 50]]))
    expect(sessionPlan(S.routines[0], later(6))[at].id).toBe(alt)
    spendSwaps(S, logSession(S, 6, [[alt, 50]]))
    expect(fixDone(S, ROW, 'swap', later(6))).toBeTruthy()
    // week 3: the lift again, and once that session is in, the marker is gone
    expect(sessionPlan(S.routines[0], later(9))[at].id).toBe(ROW)
    expect(swapPending(S, ROW, later(9))).toBe(false)
    spendSwaps(S, logSession(S, 9, [[ROW, 60]]))
    expect(cfgOf(S).swap).toBeUndefined()
  })

  it('suggests the next variant once the week is over and the lift is still stuck', () => {
    const S = stalled()
    const [a, b] = fix(S, 'swap').alts
    applyFix(S, ROW, fix(S, 'swap'), NOW)
    spendSwaps(S, logSession(S, 2, [[a, 50]]))
    spendSwaps(S, logSession(S, 9, [[ROW, 60]]))
    expect(fixDone(S, ROW, 'swap', later(9))).toBeNull()
    expect(fixAction(S, ROW, fixesOf(S, ROW, later(9)).find(f => f.kind === 'swap'), later(9))).toMatchObject({ to: b, tried: [a, b] })
  })

  it('keeps a swap waiting when its session didn\'t do the variant', () => {
    const S = stalled()
    applyFix(S, ROW, fix(S, 'swap'), NOW)
    spendSwaps(S, { routineId: 'demo', d: isoOf(later(2)), entries: [{ id: fix(S, 'swap').alts[0], sets: [{ w: 50, r: 8, done: false }] }] })
    expect(cfgOf(S).swap.until).toBeUndefined()
    expect(swapPending(S, ROW, later(30))).toBe(true)
  })

  it('takes a waiting swap back on undo, and counts that variant as never tried', () => {
    const S = stalled()
    const [a] = fix(S, 'swap').alts
    applyFix(S, ROW, fix(S, 'swap'), NOW)
    undoFix(S, ROW, 'swap')
    expect(cfgOf(S)).toEqual({ id: ROW, sets: 3, reps: 5 })
    expect(fixDone(S, ROW, 'swap', NOW)).toBeNull()
    expect(fixAction(S, ROW, fix(S, 'swap'), NOW).to).toBe(a)
  })

  it('doesn\'t carry a deload week over to the stand-in', () => {
    const S = stalled()
    applyFix(S, ROW, fix(S, 'deload'), NOW)
    applyFix(S, ROW, fix(S, 'swap'), NOW)
    expect(sessionPlan(S.routines[0], NOW).find(c => c.id === fix(S, 'swap').alts[0]).deload).toBeUndefined()
  })
})

describe('fixDone', () => {
  it('stays done while the lift is still flat, so Peek moves on to its next idea', () => {
    const S = stalled()
    applyFix(S, ROW, fix(S, 'sets'), NOW)
    logSession(S, 2, [[ROW, 60]])
    expect(fixDone(S, ROW, 'sets', later(2))).toBeTruthy()
  })

  it('lapses once the lift sets a new best — a later stall is a new one', () => {
    const S = stalled()
    applyFix(S, ROW, fix(S, 'sets'), NOW)
    logSession(S, 2, [[ROW, 62.5]])
    expect(fixDone(S, ROW, 'sets', later(2))).toBeNull()
  })

  it('drops a lapsed marker when the next fix for the lift is accepted', () => {
    const S = stalled()
    applyFix(S, ROW, fix(S, 'sets'), NOW)
    logSession(S, 2, [[ROW, 62.5]])
    applyFix(S, ROW, { kind: 'deload', factor: 0.9, weight: 55 }, later(3))
    expect(Object.keys(S.liftFixes[ROW])).toEqual(['deload'])
  })
})
