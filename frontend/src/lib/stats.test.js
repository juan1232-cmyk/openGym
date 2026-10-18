import { setRatings, loadRatings } from './ratings.js'
import { describe, it, expect } from 'vitest'
import {
  rangeBounds, prevBounds, inRange, adherence, buckets, bucketBy, weeksTrained, bestRun,
  personalBests, mainLift, AREAS, areaSets, liftsToWatch, weeklySets, setZone, mainLiftsWeek, isMainLift, bwPace, weekdayPattern
} from './stats.js'
import { SCENARIOS } from '../device/scenarios.js'
import { MUSCLES } from './muscles.js'
import { EXDB } from './exercises.js'
import { isoOf } from './format.js'

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

describe('liftsToWatch', () => {
  const NOW = new Date()
  // Every demo profile holds its row at 60 × 5 for eight sessions — flat by e1RM, so it shows
  // up after whatever the scenario is named for.
  const ROW = '0027'
  it('flags planned lifts stuck on their target, most-stuck first', () => {
    const w = liftsToWatch(SCENARIOS.stalled.state(NOW), NOW)
    expect(w.map(x => x.kind)).toEqual(['stuck', 'stuck', 'flat'])
    expect(w.filter(x => x.kind === 'stuck').every(x => x.n >= 2)).toBe(true)
  })

  it('flags lifts whose estimated 1RM is falling', () => {
    const w = liftsToWatch(SCENARIOS.slipping.state(NOW), NOW)
    expect(w.map(x => x.kind)).toEqual(['down', 'down', 'flat'])
  })

  it('has nothing to say about a progressing lift, only the one that isn\'t moving', () => {
    expect(liftsToWatch(SCENARIOS.progressing.state(NOW), NOW).map(x => [x.id, x.kind])).toEqual([[ROW, 'flat']])
  })

  // sessions of 3 × 5 at the given weights, the last one yesterday, two days apart
  const sessions = (ws, cfg) => ({
    unit: 'kg', routines: cfg ? [{ id: 'r', ex: [cfg] }] : [], customEx: [],
    workouts: ws.map((w, i) => {
      const d = isoOf(new Date(NOW.getTime() - (ws.length - i) * 2 * 864e5))
      return wo(d, [{ id: LIFT, sets: [set(w, 5), set(w, 5), set(w, 5)] }], { start: new Date(d + 'T18:00:00').getTime() })
    })
  })

  it('calls a lift flat after 3 sessions without a new e1RM best, not after 2', () => {
    expect(liftsToWatch(sessions([100, 100, 100]), NOW)).toEqual([])
    const w = liftsToWatch(sessions([100, 100, 100, 100]), NOW)
    expect(w.map(x => [x.id, x.kind, x.n])).toEqual([[LIFT, 'flat', 3]])
  })

  it('starts counting again from a new best', () => {
    expect(liftsToWatch(sessions([100, 100, 100, 102.5, 100, 100]), NOW)).toEqual([])
    expect(liftsToWatch(sessions([100, 100, 100, 102.5, 100, 100, 100]), NOW)[0].n).toBe(3)
  })

  it('lists the fixes in order: more sets, a similar exercise, then a deload week', () => {
    const [x] = liftsToWatch(sessions([100, 100, 100, 100]), NOW)
    expect(x.fixes.map(f => f.kind)).toEqual(['sets', 'swap', 'deload'])
    expect(x.fixes[0].add).toEqual([1, 2])
    expect(x.fixes[1].alt).toBeTruthy()
    expect(x.fixes[1].alt).not.toBe(LIFT)
    expect(x.fixes[2].factor).toBe(0.9)
    expect(x.fixes[2].weight).toBeLessThan(100)
  })

  it('shows a lift that is both stuck and flat once, as stuck, with the fixes', () => {
    const w = liftsToWatch(sessions([100, 100, 100, 100], { id: LIFT, sets: 3, reps: 8 }), NOW)
    expect(w.map(x => x.kind)).toEqual(['stuck'])
    expect(w[0].fixes.map(f => f.kind)).toEqual(['sets', 'swap', 'deload'])
  })

  it('leaves out a flat lift that hasn\'t been trained in a month', () => {
    const S = sessions([100, 100, 100, 100])
    S.workouts.forEach(w => { w.d = isoOf(new Date(new Date(w.d + 'T12:00:00').getTime() - 40 * 864e5)) })
    expect(liftsToWatch(S, NOW)).toEqual([])
  })
})

describe('weeklySets / setStatus', () => {
  it('spreads the range\'s sets over its weeks', () => {
    expect(weeklySets({ chest: 30 }, rangeBounds(30, TODAY)).chest).toBeCloseTo(7)
  })

  it('counts a part-done week as one week, not scaled up', () => {
    expect(weeklySets({ chest: 6 }, rangeBounds(7, TODAY)).chest).toBe(6)
  })

  it('reads four zones: under 6, 6–10, 10–20, past 20', () => {
    expect([0, 5.9, 6, 9.9, 10, 20, 20.1].map(setZone))
      .toEqual(['under', 'under', 'ok', 'ok', 'productive', 'productive', 'over'])
  })
})

describe('mainLiftsWeek', () => {
  const SQUAT = '0043', BENCH = '0025', LEG_EXT = '0585'
  const reps = (...rs) => rs.map(r => set(100, r))

  it('counts heavy sets (8 reps or fewer) and sessions this week, per main lift', () => {
    const ws = [
      wo('2026-09-21', [{ id: SQUAT, sets: reps(5, 5, 10) }]),
      wo('2026-09-23', [{ id: SQUAT, sets: reps(8, 9) }]),
    ]
    expect(mainLiftsWeek(ws, TODAY)).toEqual([{ id: SQUAT, sessions: 2, heavy: 3, few: false }])
  })

  it('flags a main lift trained lately but fewer than twice this week', () => {
    const ws = [
      wo('2026-09-08', [{ id: BENCH, sets: reps(5) }]),
      wo('2026-09-22', [{ id: SQUAT, sets: reps(5) }]),
    ]
    expect(mainLiftsWeek(ws, TODAY)).toEqual([
      { id: SQUAT, sessions: 1, heavy: 1, few: true },
      { id: BENCH, sessions: 0, heavy: 0, few: true },
    ])
  })

  it('leaves out isolation work and lifts not trained in the last four weeks', () => {
    const ws = [
      wo('2026-08-20', [{ id: BENCH, sets: reps(5) }]),
      wo('2026-09-22', [{ id: LEG_EXT, sets: reps(5) }]),
    ]
    expect(mainLiftsWeek(ws, TODAY)).toEqual([])
  })

  it('goes by the strength-transfer rating where a lift has one, the name where it has none', async () => {
    expect(isMainLift('0085')).toBe(true)    // romanian deadlift, T 7
    expect(isMainLift('0743')).toBe(false)   // sled hack squat: a compound by name, but T 6
    expect(isMainLift('0577')).toBe(false)   // lever chest press, T 5
    expect(isMainLift('0027')).toBe(true)    // barbell bent over row, T 7
    expect(isMainLift('0585')).toBe(false)   // leg extension: isolation, T 2
    // ratings table not loaded yet (or a lift it doesn't hold): the name decides
    setRatings(null)
    try {
      expect(isMainLift('0743')).toBe(true)  // a compound by name
      expect(isMainLift('0585')).toBe(false)
    } finally { await loadRatings() }
  })

  it('ignores sets not ticked off', () => {
    expect(mainLiftsWeek([wo('2026-09-22', [{ id: SQUAT, sets: [{ w: 100, r: 5, done: false }] }])], TODAY)).toEqual([])
  })
})

describe('bwPace', () => {
  // losing half a kilo a week, weighing in every four days
  const losing = Array.from({ length: 8 }, (_, i) => ({ d: '', t: TODAY.getTime() - (28 - i * 4) * 864e5, w: 80 - i * 4 / 7 * 0.5 }))

  it('reads the pace per week off the last four weeks', () => {
    expect(bwPace(losing, null, TODAY).perWeek).toBeCloseTo(-0.5)
  })

  it('dates the goal when the pace heads toward it', () => {
    const p = bwPace(losing, 76, TODAY)
    expect(p.dir).toBe('toward')
    // about 2 kg to go at 0.5 kg a week: four weeks out
    expect(p.eta).toBe('2026-10-21')
  })

  it('says so when the pace heads away from the goal', () => {
    expect(bwPace(losing, 82, TODAY).dir).toBe('away')
  })

  it('is null without enough weigh-ins to fit a line', () => {
    expect(bwPace(losing.slice(-2), 76, TODAY)).toBeNull()
  })
})

describe('weekdayPattern', () => {
  // Mon / Wed / Fri plan; eight weeks of Mondays and Wednesdays, never a Friday
  const days = []
  for (let i = 1; i < 56; i++) { const d = new Date(TODAY); d.setDate(d.getDate() - i); if ([1, 3].includes(d.getDay())) days.push(d) }
  const S = { workouts: days.map(d => wo(d.toISOString().slice(0, 10))), dayPlan: {}, routines: [{ id: 'r' }], week: { 1: 'r', 3: 'r', 5: 'r' } }

  it('counts planned and done per weekday, Monday first', () => {
    const p = weekdayPattern(S, rangeBounds(7, TODAY), TODAY)
    expect(p.days[0].planned).toBe(p.days[0].done)
    expect(p.days[4].done).toBe(0)
    expect(p.days[4].planned).toBeGreaterThanOrEqual(7)
  })

  it('names the weekday that keeps getting skipped', () => {
    expect(weekdayPattern(S, rangeBounds(7, TODAY), TODAY).worst.wd).toBe(4)
  })

  it('breaks a tie on misses toward the day missed more of the time', () => {
    // Mondays planned 4×, done once; Wednesdays planned 3×, never done — both missed 3 times
    const S = { workouts: [wo('2026-09-21'), wo('2026-08-31')], dayPlan: {}, routines: [{ id: 'r' }], week: { 1: 'r', 3: 'r' } }
    expect(weekdayPattern(S, rangeBounds(7, TODAY), TODAY).worst.wd).toBe(2)
  })

  it('names nothing when no weekday is skipped as a habit', () => {
    const all = { ...S, week: { 1: 'r', 3: 'r' } }
    expect(weekdayPattern(all, rangeBounds(7, TODAY), TODAY).worst).toBeNull()
  })
})
