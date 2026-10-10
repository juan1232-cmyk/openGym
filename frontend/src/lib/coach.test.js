import { describe, it, expect } from 'vitest'
import { coachSignals, coachScore, coachMood, coachLine, coachMoment, coach, seeded, pokeReaction, BAND_OF } from './coach.js'
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

// run the mood pick over many seeds and see where it lands
const spread = (S, n = 400) => {
  const s = coachSignals(S, TODAY), score = coachScore(s), out = { high: 0, mid: 0, low: 0, late: 0 }
  for (let i = 0; i < n; i++) out[BAND_OF[coachMood(score, s, seeded('x' + i))]]++
  return out
}

describe('coachSignals', () => {
  it('reads the gap, the week and planned days that were skipped', () => {
    const s = coachSignals(skipping, TODAY)
    expect(s.daysOff).toBe(10)
    expect(s.week).toBe(0)
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
    expect(coachSignals(S, TODAY).stalled).toEqual(['squat'])
  })
})

describe('coachScore', () => {
  it('is positive for steady training and negative for a skipped week', () => {
    expect(coachScore(coachSignals(steady, TODAY))).toBeGreaterThan(0.35)
    expect(coachScore(coachSignals(skipping, TODAY))).toBeLessThan(-0.6)
  })
})

describe('coachMood', () => {
  it('always celebrates a fresh PR, even on a bad week', () => {
    const S = state([...skipping.workouts, wk(0, { prs: ['bench'] })], PLAN)
    expect(spread(S).high).toBe(400)
  })

  it('mostly lands high for steady training and low for skipping — but not always', () => {
    const good = spread(steady), bad = spread(skipping)
    expect(good.high).toBeGreaterThan(300)
    expect(good.high).toBeLessThan(400)
    expect(bad.low).toBeGreaterThan(300)
    expect(bad.low).toBeLessThan(400)
  })

  it('only ever picks moods the orb knows', () => {
    for (let i = 0; i < 200; i++) {
      for (const S of [steady, skipping, state([])]) {
        const s = coachSignals(S, TODAY)
        expect(MOODS[coachMood(coachScore(s), s, seeded('m' + i))]).toBeTruthy()
      }
    }
  })
})

describe('coachLine', () => {
  it('never leaves a placeholder unfilled', () => {
    const late = new Date('2026-09-23T23:30:00')
    const cases = [steady, skipping, state([]), state([wk(0, { prs: ['bench'] }), wk(3, { prs: ['squat'] })]),
      state([wk(0), wk(16)], PLAN), state([wk(0)]), state([wk(20), wk(25)], PLAN)]
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
})

describe('night lines', () => {
  it('goes quiet and lowercase after midnight, and still never leaves a placeholder', () => {
    const night = new Date('2026-09-24T01:30:00')
    const s = coachSignals(skipping, night)
    const lines = new Set()
    for (let i = 0; i < 300; i++) lines.add(coachLine('drowsy', s, seeded('n' + i)))
    const deep = [...lines].filter(l => l && l === l.toLowerCase())
    expect(deep.length).toBeGreaterThan(3)
    deep.forEach(l => expect(l).not.toMatch(/\{\d\}|undefined|null|NaN/))
  })
})

describe('coachMoment', () => {
  it('notices a first session, a round number and a comeback — only on the day', () => {
    const m = S => coachMoment(coachSignals(S, TODAY))
    expect(m(state([wk(0)]))).toBe('first')
    expect(m(state([wk(1)]))).toBe(null)
    expect(m(state(Array.from({ length: 10 }, (_, i) => wk(i * 2))))).toBe('milestone')
    expect(m(state([wk(0), wk(9), wk(11)]))).toBe('comeback')
    expect(m(state([wk(0), wk(2), wk(4)]))).toBe(null)
  })

  it('says the gap out loud on a comeback, and is in a good mood about it', () => {
    const S = state([wk(0), wk(16), wk(18)], PLAN)
    expect(spread(S).high).toBe(400)
    const s = coachSignals(S, TODAY)
    const lines = new Set()
    for (let i = 0; i < 200; i++) lines.add(coachLine('happy', s, seeded('c' + i)))
    expect([...lines].some(l => l.includes('16 days'))).toBe(true)
  })

  it('still lets a fresh PR take the line', () => {
    const s = coachSignals(state([wk(0, { prs: ['bench'] })]), TODAY)
    expect(coachLine('proud', s, seeded('f'))).toMatch(/bench/i)
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
