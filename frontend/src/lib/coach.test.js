import { describe, it, expect } from 'vitest'
import { coachSignals, coachMood, coachLine, coach, seeded, pokeReaction, VERDICT_MOODS } from './coach.js'
import { MOODS } from './orb-rig.js'
import { isoOf } from './format.js'

// Wednesday 23 Sep 2026, mid-morning
const TODAY = new Date('2026-09-23T10:00:00')
const iso = n => { const d = new Date(TODAY); d.setDate(d.getDate() - n); return isoOf(d) }
const wk = (n, extra = {}) => ({ d: iso(n), vol: 5000, entries: [], ...extra })
const state = (workouts, extra = {}) => ({ workouts, routines: [], week: {}, dayPlan: {}, ...extra })

// a Mon/Wed/Fri plan
const PLAN = { routines: [{ id: 'a', name: 'Push', ex: [] }], week: { 1: 'a', 3: 'a', 5: 'a' } }
// three sessions a week for four weeks, on plan, with a PR along the way
const steady = state([0, 2, 5, 7, 9, 12, 14, 16, 19, 21, 23, 26].map(n => wk(n, n === 9 ? { prs: ['row'] } : {})), PLAN)
const skipping = state([wk(10), wk(12), wk(17)], PLAN)

// run the mood pick over many seeds and collect every mood it lands on
const moods = (S, now = TODAY, n = 400) => {
  const s = coachSignals(S, now), out = new Set()
  for (let i = 0; i < n; i++) out.add(coachMood(s, seeded('x' + i)))
  return out
}

describe('coachSignals', () => {
  it('reads the gap and planned days that were skipped', () => {
    const s = coachSignals(skipping, TODAY)
    expect(s.daysOff).toBe(10)
    expect(s.planned).toBe(3)       // Mon 21, Fri 18, Wed 16
    expect(s.missed).toBe(3)
  })

  it("doesn't count planned days from before the first workout as missed", () => {
    const s = coachSignals(state([wk(1)], PLAN), TODAY)
    expect(s.missed).toBe(0)
  })

  it('only calls a PR fresh within two days, and names it', () => {
    const name = id => ({ bench: 'bench press' })[id] || id
    expect(coachSignals(state([wk(1, { prs: ['bench'] })]), TODAY, name).freshPR).toBe('bench press')
    expect(coachSignals(state([wk(4, { prs: ['bench'] })]), TODAY, name).freshPR).toBe(null)
  })

  it('flags a planned lift that missed its target two sessions running', () => {
    const miss = n => wk(n, { entries: [{ id: 'squat', sets: [{ w: 100, r: 3, done: true }] }] })
    const S = state([miss(5), miss(2)], { routines: [{ id: 'a', name: 'Legs', ex: [{ id: 'squat', sets: 1, reps: 5 }] }] })
    expect(coachSignals(S, TODAY).verdict.stalled).toEqual(['squat'])
  })
})

describe('coachMood', () => {
  it('always celebrates a fresh PR, even on a bad week', () => {
    const S = state([...skipping.workouts, wk(0, { prs: ['bench'] })], PLAN)
    for (const m of moods(S)) expect(['celebrate', 'proud', 'excited']).toContain(m)
  })

  it("only ever picks from its verdict's own faces — no noise across verdicts", () => {
    expect(coachSignals(steady, TODAY).verdict.state).toBe('progressing')
    expect(coachSignals(skipping, TODAY).verdict.state).toBe('away')
    for (const m of moods(steady)) expect(Object.keys(VERDICT_MOODS.progressing)).toContain(m)
    for (const m of moods(skipping)) expect(Object.keys(VERDICT_MOODS.away)).toContain(m)
  })

  it("doesn't fall asleep on bad news", () => {
    const late = new Date('2026-09-23T23:30:00')
    expect(moods(steady, late).has('drowsy')).toBe(true)
    expect(moods(skipping, late).has('drowsy')).toBe(false)
  })

  it('only ever picks moods the orb knows', () => {
    for (const S of [steady, skipping, state([])]) for (const m of moods(S, TODAY, 200)) expect(MOODS[m]).toBeTruthy()
  })
})

describe('coachLine', () => {
  it('never leaves a placeholder unfilled', () => {
    const late = new Date('2026-09-23T23:30:00')
    const cases = [steady, skipping, state([]), state([wk(0, { prs: ['bench'] }), wk(3, { prs: ['squat'] })])]
    for (let i = 0; i < 300; i++) {
      for (const S of cases) {
        for (const now of [TODAY, late]) {
          const { line } = coach(S, now)
          if (line != null) expect(line).not.toMatch(/\{\d\}|undefined|null|NaN/)
        }
      }
    }
  })

  it('talks about the gap when it has been a while', () => {
    const s = coachSignals(skipping, TODAY)
    const lines = new Set()
    for (let i = 0; i < 200; i++) lines.add(coachLine('angry', s, seeded('l' + i)))
    expect([...lines].some(l => l && l.includes('10 days'))).toBe(true)
  })

  it('names the lifts behind the verdict rather than a generic nag', () => {
    const at = n => new Date(iso(n) + 'T18:00:00').getTime()
    const lifts = f => [21, 17, 14, 10, 7, 3].map((n, i) => wk(n, { start: at(n), entries: [
      { id: 'bench', sets: [{ w: f(i), r: 5, done: true }] }, { id: 'squat', sets: [{ w: f(i) + 40, r: 5, done: true }] }] }))
    for (const [S, word] of [[state(lifts(i => 60 + i * 2.5), PLAN), 'going up'], [state(lifts(i => 80 - i * 2.5), PLAN), 'going down']]) {
      const s = coachSignals(S, TODAY)
      for (let i = 0; i < 100; i++) expect(coachLine('idle', s, seeded('n' + i))).toBe(`Bench and squat are both ${word}.`)
    }
  })

  it('never goes quiet when the news is bad', () => {
    const s = coachSignals(skipping, TODAY)
    for (let i = 0; i < 200; i++) expect(coachLine('angry', s, seeded('q' + i))).toBeTruthy()
  })
})

describe('coach', () => {
  it('holds its mood and line for the same moment and state', () => {
    expect(coach(steady, TODAY)).toEqual(coach(steady, TODAY))
  })

  it('shifts over the day', () => {
    const moods = new Set([2, 6, 10, 14, 18, 22].map(h => {
      const d = new Date(TODAY); d.setHours(h)
      return coach(steady, d).mood + '|' + coach(steady, d).line
    }))
    expect(moods.size).toBeGreaterThan(1)
  })
})

describe('pokeReaction', () => {
  it('escalates from a squish to suspicious to angry', () => {
    const rng = seeded('p')
    expect(pokeReaction(1, rng)).toBe(null)
    expect(pokeReaction(3, rng).mood).toBe('suspicious')
    expect(pokeReaction(6, rng).mood).toBe('angry')
    expect(pokeReaction(6, rng).line).toBeTruthy()
  })
})
