import { describe, it, expect } from 'vitest'
import { PEEK_DEF, peekOf, stageOf, STAGES, remember, noteSaid, visit, afterWorkout, callbackLine, rememberPoked } from './memory.js'
import { seeded } from './coach.js'
import { isoOf } from '../format.js'

// Wednesday 23 Sep 2026
const TODAY = new Date('2026-09-23T10:00:00')
const iso = n => { const d = new Date(TODAY); d.setDate(d.getDate() - n); return isoOf(d) }
const wk = (n, x = {}) => ({ d: iso(n), vol: 5000, entries: [], ...x })
const state = (workouts, x = {}) => ({ workouts, routines: [], week: {}, dayPlan: {}, ...x })
const PLAN = { routines: [{ id: 'a', name: 'Push', ex: [] }], week: { 1: 'a', 3: 'a', 5: 'a' } }

describe('peekOf / stageOf', () => {
  it('fills a profile that never had Peek with the defaults', () => {
    expect(peekOf({})).toEqual(PEEK_DEF)
    expect(peekOf({ peek: { bond: 20 } }).honesty).toBe('normal')
  })
  it('maps bond to the four stages', () => {
    expect(STAGES.map(stageOf)).toEqual([0, 1, 2, 3])
    expect(stageOf(14.9)).toBe(0)
    expect(stageOf(100)).toBe(3)
  })
})

describe('remember / noteSaid', () => {
  it('caps the moments list but never forgets the first session', () => {
    let p = remember(peekOf({}), 'first', iso(90))
    for (let i = 0; i < 40; i++) p = remember(p, 'pr', iso(40 - i), 'bench')
    expect(p.moments).toHaveLength(30)
    expect(p.moments[0].k).toBe('first')
  })
  it('keeps the last dozen lines, most recent last, without duplicates', () => {
    let p = peekOf({})
    for (let i = 0; i < 15; i++) p = noteSaid(p, 'l' + i)
    p = noteSaid(p, 'l5')
    expect(p.said).toHaveLength(12)
    expect(p.said[11]).toBe('l5')
    expect(p.said.filter(k => k === 'l5')).toHaveLength(1)
  })
})

describe('visit', () => {
  it('greets a 5+ day absence once', () => {
    const S = state([wk(6)])
    const a = visit(peekOf({}), S, TODAY)
    expect(a.reunion).toBe(true)
    expect(visit(a.peek, S, TODAY).reunion).toBe(false)
  })
  it('does not greet a short gap', () => {
    expect(visit(peekOf({}), state([wk(2)]), TODAY).reunion).toBe(false)
  })
  it('fades the bond after a week away, only for days not already counted', () => {
    const S = state([wk(10)])
    const a = visit({ ...peekOf({}), bond: 40, seen: iso(3) }, S, TODAY)
    expect(a.peek.bond).toBe(40 - 3 * 0.5)          // days 8, 9, 10
    const b = visit(a.peek, S, TODAY)
    expect(b.peek.bond).toBe(a.peek.bond)
  })
  it("rolls yesterday's score into carry on a new day", () => {
    const p = { ...peekOf({}), carryDay: iso(1), lastScore: -0.8, carry: 0 }
    const a = visit(p, state([wk(0)]), TODAY, 0.5)
    expect(a.peek.carry).toBe(-0.4)
    expect(a.peek.lastScore).toBe(0.5)
    expect(a.changed).toBe(true)
  })
  it('reports no change on a second visit the same day', () => {
    const S = state([wk(1)])
    const a = visit(peekOf({}), S, TODAY, 0.2)
    expect(visit(a.peek, S, TODAY, 0.2).changed).toBe(false)
  })
})

describe('afterWorkout', () => {
  it('marks the first session and remembers it', () => {
    const r = afterWorkout(peekOf({}), state([]), wk(0))
    expect(r.events.map(e => e.k)).toContain('first')
    expect(r.peek.moments[0].k).toBe('first')
    expect(r.peek.bond).toBeGreaterThan(0)
  })
  it('gives more bond for a planned session with a PR, almost none for an early finish', () => {
    const S = state([wk(2)], PLAN)
    const good = afterWorkout(peekOf({}), S, { ...wk(0), routineId: 'a', prs: ['bench'] })
    const early = afterWorkout(peekOf({}), S, { ...wk(0), routineId: 'a' }, { early: true })
    expect(good.peek.bond).toBe(5)
    expect(early.peek.bond).toBe(0.5)
    expect(early.peek.moments.some(m => m.k === 'early')).toBe(true)
  })
  it('notices a comeback, a milestone and a new bond stage', () => {
    const S = state(Array.from({ length: 9 }, (_, i) => wk(30 + i)))
    const r = afterWorkout({ ...peekOf({}), bond: 13 }, S, wk(0))
    const ks = r.events.map(e => e.k)
    expect(ks).toContain('comeback')
    expect(ks).toContain('milestone')
    expect(r.events.find(e => e.k === 'stageUp').stage).toBe(1)
  })
})

describe('callbackLine', () => {
  const opts = { stage: 2 }
  it('says nothing to a stranger, however much history there is', () => {
    const p = { ...peekOf({}), moments: [{ k: 'first', d: iso(60) }, { k: 'early', d: iso(1) }] }
    for (let i = 0; i < 50; i++) expect(callbackLine(p, state([wk(1)]), TODAY, seeded('c' + i), { stage: 0 })).toBe(null)
  })
  it('brings up an early finish when it was the last session', () => {
    const p = { ...peekOf({}), moments: [{ k: 'early', d: iso(1) }] }
    expect(callbackLine(p, state([wk(1)]), TODAY, seeded('e'), opts).text).toMatch(/finished early/)
  })
  it('notices a planned day skipped two weeks running', () => {
    // Mon/Wed/Fri plan; trained every planned day except Mondays 21 and 14 Sep
    const S = state([wk(20), wk(19), wk(18), wk(16), wk(12), wk(11), wk(7), wk(5), wk(4), wk(0)], PLAN)
    const lines = new Set()
    for (let i = 0; i < 40; i++) { const l = callbackLine(peekOf({}), S, TODAY, seeded('s' + i), opts); if (l) lines.add(l.text) }
    expect([...lines].some(l => l.includes('Monday'))).toBe(true)
  })
  it('remembers being poked for a few days', () => {
    const p = rememberPoked(peekOf({}), new Date(TODAY.getTime() - 864e5))
    expect(callbackLine(p, state([wk(0)]), TODAY, seeded('p'), opts).text).toMatch(/poking/)
    expect(rememberPoked(p, new Date(TODAY.getTime() - 864e5))).toBe(p)
  })
})
