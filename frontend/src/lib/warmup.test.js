import { describe, it, expect } from 'vitest'
import {
  isWork, workSets, workIndexOf, addWarmup, removeWarmup,
  lastEntryFor, bestWeightFor, isLoadPR, workoutVolume, setsDone, topSet
} from './history.js'
import { bestSetOf, e1rmSeries, best1RM, is1RMRecord } from './onerm.js'
import { readSession, sessionsFor, nextPrescription, applyPrescription } from './progression.js'
import { loadOfWorkouts, loadOfActive } from './muscles.js'
import { effortSummary, effortHistogram, hasEffort } from './effort.js'
import { exerciseSessions, exerciseRecords, exerciseMetrics } from './exercise-records.js'
import { progressSeries } from './progress.js'
import { mainLiftsWeek } from './stats.js'
import { spendSwaps } from './liftfix.js'

// A warm-up is a set with `warmup: true`: stored in the workout so the session reads back the
// way it was lifted, and then ignored by everything that decides what you did or how you are
// getting on. The warm-ups below are deliberately tempting — one is an opener heavier than any
// work set (80 x 3) that out-estimates them, one is rated "to failure" — so a reader that
// forgets the flag gives a different answer, not the same one by luck.
const BENCH = '0025'
const WARM = [
  { w: 40, r: 12, rir: 0, done: true, warmup: true },
  { w: 80, r: 3, done: true, warmup: true }
]
const work = (w, r) => [1, 2, 3].map(() => ({ w, r, rir: 4, done: true }))   // easy: nothing hard to count

const HISTORY = [[60, 8, '2026-09-14'], [60, 8, '2026-09-16'], [62.5, 8, '2026-09-22']]
const state = warm => ({
  unit: 'kg',
  workouts: HISTORY.map(([w, r, d], i) => ({
    id: 'w' + i, d, start: Date.parse(d + 'T10:00:00'),
    entries: [{ id: BENCH, target: { sets: 3, reps: 8, weight: w, mode: 'reps' }, sets: [...(warm ? WARM : []), ...work(w, r)] }]
  }))
})
const plain = state(false), warmed = state(true)

// The same question asked of a profile with and without warm-ups must have one answer. `base`
// is checked non-empty so "equal" cannot mean "both nothing".
const same = (fn, expectBase) => {
  const base = fn(plain)
  expect(base).toBeTruthy()
  if (expectBase) expect(base).toMatchObject(expectBase)
  expect(fn(warmed)).toEqual(base)
}

describe('the flag', () => {
  it('isWork and workSets split warm-up rows from work rows', () => {
    const rows = [...WARM, ...work(60, 8)]
    expect(rows.filter(isWork)).toHaveLength(3)
    expect(workSets(rows)).toEqual(work(60, 8))
    expect(workSets(undefined)).toEqual([])
  })

  it('workIndexOf numbers work rows from 0 and gives warm-ups none', () => {
    const rows = [WARM[0], WARM[1], { w: 60 }, { w: 60 }]
    expect(rows.map((_, i) => workIndexOf(rows, i))).toEqual([null, null, 0, 1])
  })
})

describe('adding and removing warm-ups', () => {
  const rows = () => [{ w: 60, r: 8, done: false }, { w: 60, r: 8, done: false }, { w: 60, r: 8, done: false }]

  it('puts the first warm-up before the work, at half the first work weight on the loading step', () => {
    const out = addWarmup(rows(), 'reps', { reps: 8 }, 2.5)
    expect(out).toHaveLength(4)
    expect(out[0]).toEqual({ w: 30, r: 8, done: false, warmup: true })
    expect(out.slice(1).every(isWork)).toBe(true)
  })

  it('snaps the half weight to a loadable step, in either unit', () => {
    expect(addWarmup([{ w: 62.5, r: 5 }], 'reps', {}, 2.5)[0].w).toBe(32.5)
    expect(addWarmup([{ w: 135, r: 5 }], 'reps', {}, 5)[0].w).toBe(70)
  })

  it('never starts below one step, and leaves bodyweight rows at zero', () => {
    expect(addWarmup([{ w: 2.5, r: 5 }], 'reps', {}, 2.5)[0].w).toBe(2.5)
    expect(addWarmup([{ w: 0, r: 12 }], 'reps', {}, 2.5)[0]).toMatchObject({ w: 0, r: 12, warmup: true })
    expect(addWarmup([{ r: 12 }], 'reps', {}, 2.5)[0].w).toBe(0)
  })

  it('a second warm-up copies the last one and lands after it, still before the work', () => {
    const one = addWarmup(rows(), 'reps', { reps: 8 }, 2.5)
    one[0].w = 40
    const two = addWarmup(one, 'reps', { reps: 8 }, 2.5)
    expect(two.map(s => !!s.warmup)).toEqual([true, true, false, false, false])
    expect(two[1]).toEqual({ w: 40, r: 8, done: false, warmup: true })
  })

  it('builds the row the exercise mode logs', () => {
    expect(addWarmup([{ sec: 45, w: 10 }], 'time', {}, 2.5)[0]).toEqual({ sec: 45, w: 10, done: false, warmup: true })
    expect(addWarmup([{ min: 20, speed: 9 }], 'cardio', {}, 2.5)[0]).toEqual({ min: 20, speed: 9, done: false, warmup: true })
  })

  it('does not touch the rows it was given', () => {
    const r = rows()
    const before = JSON.stringify(r)
    addWarmup(r, 'reps', { reps: 8 }, 2.5)
    expect(JSON.stringify(r)).toBe(before)
  })

  it('removeWarmup takes the last warm-up and never a work row', () => {
    const out = removeWarmup([...WARM, ...work(60, 8)])
    expect(out).toHaveLength(4)
    expect(out.filter(s => s.warmup)).toEqual([WARM[0]])
    const bare = work(60, 8)
    expect(removeWarmup(bare)).toEqual(bare)
  })
})

describe('warm-ups are not the session', () => {
  it('last time and the heaviest set ignore them', () => {
    same(S => lastEntryFor(S, BENCH))
    same(S => bestWeightFor(S, BENCH), undefined)
    expect(bestWeightFor(warmed, BENCH)).toBe(62.5)       // not the 80 opener
    expect(lastEntryFor(warmed, BENCH).sets).toHaveLength(3)
  })

  it('a session that only warmed up has no last time', () => {
    const S = { workouts: [{ d: '2026-09-01', entries: [{ id: BENCH, sets: WARM }] }] }
    expect(lastEntryFor(S, BENCH)).toBeNull()
  })

  it('a heavy opener is not a load PR, a heavier work set still is', () => {
    const entry = (...sets) => ({ id: BENCH, sets })
    expect(isLoadPR(plain, BENCH, entry({ w: 62.5, r: 8, done: true }))).toBe(false)
    expect(isLoadPR(warmed, BENCH, entry(...WARM, { w: 62.5, r: 8, done: true }))).toBe(false)
    expect(isLoadPR(warmed, BENCH, entry(...WARM, { w: 65, r: 5, done: true }))).toBe(true)
  })

  it('volume, set count and the top set are the work sets', () => {
    same(S => workoutVolume(S.workouts[2]))
    same(S => setsDone(S.workouts[2]), undefined)
    expect(setsDone(warmed.workouts[2])).toBe(3)
    same(S => topSet(S.workouts[2].entries[0]))
  })

  it('does not raise the estimated 1RM, its trend or its record', () => {
    same(S => bestSetOf(S.workouts[2].entries[0]))
    same(S => e1rmSeries(S, BENCH))
    same(S => best1RM(S, BENCH))
    // an 80 x 3 opener estimates higher than 62.5 x 8 with 4 in reserve; as a warm-up it must not make a record
    const next = (...sets) => ({ id: BENCH, sets })
    expect(is1RMRecord(warmed, BENCH, next(...WARM, { w: 62.5, r: 8, done: true }))).toBeNull()
  })

  it('does not feed progression: reading a session, the history, or the next prescription', () => {
    const cfg = { id: BENCH, sets: 3, reps: 8, weight: 62.5, mode: 'reps' }
    same(S => readSession(S.workouts[2].entries[0]))
    same(S => sessionsFor(S, BENCH, cfg))
    // all work reps hit: the warm-up's single rep must not read as a miss
    same(S => nextPrescription(S, cfg), { kind: 'up' })
  })

  it('a prescription rewrites the work rows and leaves warm-ups exactly as logged', () => {
    const sets = [{ w: 40, r: 8, done: true, warmup: true }, { w: 60, r: 8, done: true }, { w: 60, r: 8, done: false }]
    const out = applyPrescription(sets, { kind: 'up', weight: 62.5, reps: 8 })
    expect(out[0]).toEqual(sets[0])
    expect(out[1]).toEqual(sets[1])
    expect(out[2].w).toBe(62.5)
  })

  it('a prescription that adds sets grows the work rows, not the warm-ups', () => {
    const sets = [{ w: 40, r: 8, done: false, warmup: true }, { w: 60, r: 8, done: false }]
    const out = applyPrescription(sets, { kind: 'up', weight: 60, reps: 8, sets: 3 })
    expect(out.filter(isWork)).toHaveLength(3)
    expect(out.filter(s => s.warmup)).toHaveLength(1)
  })

  it('does not count towards muscle load, finished or live', () => {
    same(S => loadOfWorkouts(S.workouts))
    const active = warm => ({ entries: [{ id: BENCH, sets: [...(warm ? WARM : []), ...work(60, 8)] }] })
    expect(loadOfActive(active(true))).toEqual(loadOfActive(active(false)))
  })

  it('does not count as effort: a warm-up rated "to failure" is not a hard set', () => {
    same(S => effortSummary(S, 0), { done: 9, rated: 9, hard: 0 })
    same(S => effortHistogram(S, 0))
    same(S => hasEffort(S))
  })

  it('does not enter the exercise page: sessions, records, charts', () => {
    same(S => exerciseSessions(S, BENCH))
    same(S => exerciseRecords(S, BENCH))
    same(S => exerciseMetrics(S, BENCH))
    same(S => progressSeries(S, BENCH))
    expect(exerciseRecords(warmed, BENCH).heaviest.w).toBe(62.5)
  })

  it('does not make a heavy week: a three-rep opener is not a heavy set', () => {
    const now = new Date('2026-09-23T09:00:00')
    same(S => mainLiftsWeek(S.workouts, now), [{ id: BENCH, sessions: 1, heavy: 3 }])   // the three 8-rep work sets, not the 3-rep opener
  })
})

describe('finishing', () => {
  const routine = { id: 'r', ex: [{ id: 'swapped', swap: { to: 'variant' } }] }
  const finished = sets => ({ routineId: 'r', d: '2026-09-23', entries: [{ id: 'variant', sets }] })

  it('a variant only warmed up has not had its go yet', () => {
    const S = { routines: [JSON.parse(JSON.stringify(routine))] }
    spendSwaps(S, finished(WARM))
    expect(S.routines[0].ex[0].swap.until).toBeUndefined()
  })

  it('a variant that was worked has', () => {
    const S = { routines: [JSON.parse(JSON.stringify(routine))] }
    spendSwaps(S, finished([...WARM, { w: 60, r: 8, done: true }]))
    expect(S.routines[0].ex[0].swap.until).toBeTruthy()
  })
})
