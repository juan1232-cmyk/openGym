import { describe, it, expect } from 'vitest'
import { progressVerdict, liftTrend, sessionVerdict, setVsLast } from './verdict.js'
import { isoOf } from './format.js'

// Wednesday 23 Sep 2026, mid-morning
const TODAY = new Date('2026-09-23T10:00:00')
const iso = n => { const d = new Date(TODAY); d.setDate(d.getDate() - n); return isoOf(d) }
const at = n => new Date(iso(n) + 'T18:00:00').getTime()
// one session `n` days ago with one entry per [id, weight, reps]
const wk = (n, lifts = [], extra = {}) => ({
  d: iso(n), start: at(n), vol: 5000,
  entries: lifts.map(([id, w, r]) => ({ id, sets: [{ w, r, done: true }, { w, r, done: true }] })),
  ...extra
})
const state = (workouts, extra = {}) => ({ workouts, routines: [], week: {}, dayPlan: {}, ...extra })
const DAYS = [21, 17, 14, 10, 7, 3]
// a lift's weight across DAYS, as a function of the session index
const series = (id, f, r = 5) => DAYS.map((n, i) => [n, [id, f(i), r]])
const build = (...lifts) => {
  const by = {}
  lifts.flat().forEach(([n, l]) => { (by[n] = by[n] || []).push(l) })
  return Object.keys(by).map(Number).sort((a, b) => b - a).map(n => wk(n, by[n]))
}

describe('liftTrend', () => {
  it('reads up, flat and down from the same series the progress page charts', () => {
    const S = state(build(series('bench', i => 60 + i * 2.5), series('squat', () => 100), series('row', i => 70 - i * 2.5)))
    expect(liftTrend(S, 'bench', TODAY).dir).toBe('up')
    expect(liftTrend(S, 'squat', TODAY).dir).toBe('flat')
    expect(liftTrend(S, 'row', TODAY).dir).toBe('down')
  })

  it('counts more reps at the same weight as going up', () => {
    const S = state(DAYS.map((n, i) => wk(n, [['bench', 60, 5 + i]])))
    expect(liftTrend(S, 'bench', TODAY).dir).toBe('up')
  })

  it("has no opinion on a lift that hasn't been trained in a month", () => {
    const S = state([40, 36, 32, 29].map((n, i) => wk(n, [['bench', 60 + i * 5, 5]])))
    expect(liftTrend(S, 'bench', TODAY)).toBe(null)
  })

  it('needs a few sessions spread out before calling a trend', () => {
    const S = state([wk(3, [['bench', 60, 5]]), wk(1, [['bench', 70, 5]])])
    expect(liftTrend(S, 'bench', TODAY)).toBe(null)
  })
})

describe('progressVerdict', () => {
  it('is new until there are a few sessions to judge', () => {
    expect(progressVerdict(state([]), TODAY).state).toBe('new')
    expect(progressVerdict(state([wk(2), wk(1)]), TODAY).state).toBe('new')
  })

  it('progressing when more lifts go up than down, naming them', () => {
    const v = progressVerdict(state(build(series('bench', i => 60 + i * 2.5), series('squat', i => 100 + i * 5))), TODAY)
    expect(v.state).toBe('progressing')
    expect(v.up).toEqual(['bench', 'squat'])
  })

  it('slipping when more lifts go down than up', () => {
    const v = progressVerdict(state(build(series('bench', i => 60 + i * 2.5), series('squat', i => 100 - i * 5), series('row', i => 70 - i * 2.5))), TODAY)
    expect(v.state).toBe('slipping')
    expect(v.down).toEqual(['squat', 'row'])
  })

  it('holding when nothing moves', () => {
    expect(progressVerdict(state(build(series('bench', () => 60))), TODAY).state).toBe('holding')
  })

  it('a recent PR is progress even without a trend yet', () => {
    expect(progressVerdict(state([wk(9), wk(5), wk(2, [], { prs: ['bench'] })]), TODAY).state).toBe('progressing')
  })

  it('stalled when two planned lifts keep missing their target — over any trend', () => {
    const routines = [{ id: 'a', name: 'A', ex: [{ id: 'bench', sets: 2, reps: 8 }, { id: 'squat', sets: 2, reps: 8 }] }]
    // both climbing in weight, but every session short of the 8 reps planned
    const S = state(build(series('bench', i => 60 + i * 2.5), series('squat', i => 100 + i * 5)), { routines })
    const v = progressVerdict(S, TODAY)
    expect(v.stalled).toEqual(['bench', 'squat'])
    expect(v.state).toBe('stalled')
  })

  it('away after ten days off, whatever the lifts did before', () => {
    const S = state([24, 20, 17, 14, 12].map((n, i) => wk(n, [['bench', 60 + i * 5, 5]])))
    expect(progressVerdict(S, TODAY).state).toBe('away')
  })

  it('is the same verdict every time for the same log', () => {
    const S = state(build(series('bench', i => 60 + i * 2.5)))
    const a = progressVerdict(S, TODAY)
    for (let i = 0; i < 20; i++) expect(progressVerdict(S, TODAY)).toEqual(a)
  })
})

describe('sessionVerdict', () => {
  it('a record wins whatever the volume did', () => {
    expect(sessionVerdict({ prs: ['bench'], vol: 100, prevVol: 1000 })).toBe('record')
    expect(sessionVerdict({ e1prs: [{ id: 'bench' }], vol: 100, prevVol: 1000 })).toBe('record')
  })
  it('compares volume with the last time, with a little slack for "same"', () => {
    expect(sessionVerdict({ vol: 1100, prevVol: 1000 })).toBe('more')
    expect(sessionVerdict({ vol: 1000, prevVol: 1000 })).toBe('same')
    expect(sessionVerdict({ vol: 950, prevVol: 1000 })).toBe('same')
    expect(sessionVerdict({ vol: 800, prevVol: 1000 })).toBe('less')
    expect(sessionVerdict({ vol: 800, prevVol: null })).toBe('first')
  })
})

describe('setVsLast', () => {
  it('heavier beats, same weight goes by reps', () => {
    expect(setVsLast({ w: 62.5, r: 3 }, { w: 60, r: 5 })).toBe('beat')
    expect(setVsLast({ w: 60, r: 6 }, { w: 60, r: 5 })).toBe('beat')
    expect(setVsLast({ w: 60, r: 5 }, { w: 60, r: 5 })).toBe('match')
    expect(setVsLast({ w: 60, r: 4 }, { w: 60, r: 5 })).toBe('short')
  })
  it('lighter is even with more reps, short without', () => {
    expect(setVsLast({ w: 50, r: 10 }, { w: 60, r: 5 })).toBe('match')
    expect(setVsLast({ w: 50, r: 5 }, { w: 60, r: 5 })).toBe('short')
  })
  it('holds go by seconds; nothing to compare is null', () => {
    expect(setVsLast({ sec: 45 }, { sec: 40 })).toBe('beat')
    expect(setVsLast({ w: 60, r: 5 }, null)).toBe(null)
    expect(setVsLast({ min: 20, speed: 10 }, { min: 20, speed: 9 })).toBe(null)
  })
})
