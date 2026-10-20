import { describe, it, expect } from 'vitest'
import { exerciseSessions, exerciseRecords, exerciseMetrics } from './exercise-records.js'

const w = (id, d, sets, extra = {}) => ({ id, d, name: extra.name, entries: [{ id: 'x', sets: sets.map(s => ({ done: true, ...s })), target: extra.target }] })

describe('exerciseSessions', () => {
  it('lists sessions newest first with only the sets that were done', () => {
    const S = { workouts: [
      w('a', '2026-01-02', [{ w: 50, r: 8 }], { name: 'Push' }),
      { id: 'b', d: '2026-01-05', name: 'Pull', entries: [{ id: 'y', sets: [{ done: true, w: 1, r: 1 }] }] },
      { id: 'c', d: '2026-01-09', name: 'Push', entries: [{ id: 'x', sets: [{ done: true, w: 52.5, r: 8 }, { done: false, w: 60, r: 8 }] }] }
    ] }
    const s = exerciseSessions(S, 'x')
    expect(s.map(x => x.id)).toEqual(['c', 'a'])
    expect(s[0].sets).toEqual([{ done: true, w: 52.5, r: 8 }])
    expect(s[1].name).toBe('Push')
  })

  it('is empty for an exercise that was never logged, or only skipped', () => {
    const S = { workouts: [{ id: 'a', d: '2026-01-02', entries: [{ id: 'x', sets: [{ done: false, w: 50, r: 8 }] }] }] }
    expect(exerciseSessions(S, 'x')).toEqual([])
    expect(exerciseSessions({ workouts: [] }, 'x')).toEqual([])
  })
})

describe('exerciseRecords', () => {
  const S = { workouts: [
    w('a', '2026-01-02', [{ w: 50, r: 10 }, { w: 60, r: 5 }]),
    w('b', '2026-01-09', [{ w: 57.5, r: 8 }, { w: 40, r: 12 }, { w: 57.5, r: 6 }])
  ] }

  it('finds the heaviest weight, best set and best session volume', () => {
    const r = exerciseRecords(S, 'x')
    expect(r.heaviest).toEqual({ w: 60, d: '2026-01-02' })
    expect(r.bestSet).toMatchObject({ w: 50, r: 10, vol: 500 })
    expect(r.bestSession).toEqual({ vol: 40 * 12 + 57.5 * 8 + 57.5 * 6, d: '2026-01-09' })
  })

  it('keeps the heaviest weight for each exact rep count, by reps ascending', () => {
    expect(exerciseRecords(S, 'x').byReps).toEqual([
      { reps: 5, w: 60 }, { reps: 6, w: 57.5 }, { reps: 8, w: 57.5 }, { reps: 10, w: 50 }, { reps: 12, w: 40 }
    ])
  })

  it('reports reps, not weight, for a bodyweight exercise', () => {
    const bw = { workouts: [w('a', '2026-01-02', [{ r: 10 }, { r: 12 }]), w('b', '2026-01-09', [{ r: 9 }])] }
    const r = exerciseRecords(bw, 'x')
    expect(r.heaviest).toBeNull()
    expect(r.bestSet).toBeNull()
    expect(r.byReps).toEqual([])
    expect(r.mostReps).toEqual({ r: 12, d: '2026-01-02' })
    expect(r.mostSessionReps).toEqual({ r: 22, d: '2026-01-02' })
  })

  it('reports the longest hold and the cardio bests', () => {
    const hold = { workouts: [w('a', '2026-01-02', [{ sec: 30 }, { sec: 45 }])] }
    expect(exerciseRecords(hold, 'x').longestHold).toEqual({ sec: 45, d: '2026-01-02' })
    const run = { workouts: [w('a', '2026-01-02', [{ min: 20, speed: 8 }]), w('b', '2026-01-09', [{ min: 30, speed: 7 }])] }
    const r = exerciseRecords(run, 'x')
    expect(r.topSpeed).toEqual({ speed: 8, d: '2026-01-02' })
    expect(r.longestMin).toEqual({ min: 30, d: '2026-01-09' })
  })

  it('ignores sets that were not done and returns nothing for an unlogged exercise', () => {
    const skipped = { workouts: [{ id: 'a', d: '2026-01-02', entries: [{ id: 'x', sets: [{ done: false, w: 100, r: 5 }] }] }] }
    expect(exerciseRecords(skipped, 'x').heaviest).toBeNull()
    expect(exerciseRecords({ workouts: [] }, 'x').byReps).toEqual([])
  })
})

describe('exerciseMetrics', () => {
  const day = (id, d, sets) => ({ id, d, start: Date.parse(d + 'T10:00:00Z'), entries: [{ id: 'x', sets: sets.map(s => ({ done: true, ...s })) }] })

  it('gives one point per session, oldest first, for the loaded measures', () => {
    const S = { workouts: [day('a', '2026-01-02', [{ w: 50, r: 10 }, { w: 60, r: 5 }]), day('b', '2026-01-09', [{ w: 57.5, r: 8 }])] }
    const m = exerciseMetrics(S, 'x')
    expect(m.weight.map(p => p.y)).toEqual([60, 57.5])
    expect(m.setVol.map(p => p.y)).toEqual([500, 460])
    expect(m.sessionVol.map(p => p.y)).toEqual([800, 460])
    expect(m.reps).toBeUndefined()
  })

  it('charts reps for an unloaded exercise and leaves out weight measures', () => {
    const S = { workouts: [day('a', '2026-01-02', [{ r: 8 }, { r: 6 }]), day('b', '2026-01-09', [{ r: 10 }])] }
    const m = exerciseMetrics(S, 'x')
    expect(m.reps.map(p => p.y)).toEqual([8, 10])
    expect(m.sessionReps.map(p => p.y)).toEqual([14, 10])
    expect(m.weight).toBeUndefined()
    expect(m.sessionVol).toBeUndefined()
  })

  it('keeps timed and cardio sets under their own keys and ignores skipped sets', () => {
    const S = { workouts: [
      day('a', '2026-01-02', [{ sec: 45 }]),
      { id: 'b', d: '2026-01-09', start: 1, entries: [{ id: 'x', sets: [{ done: false, w: 100, r: 5 }] }] },
      day('c', '2026-01-12', [{ min: 20, speed: 9 }])
    ] }
    const m = exerciseMetrics(S, 'x')
    expect(m.hold.map(p => p.y)).toEqual([45])
    expect(m.speed.map(p => p.y)).toEqual([9])
    expect(m.min.map(p => p.y)).toEqual([20])
    expect(m.weight).toBeUndefined()
  })
})
