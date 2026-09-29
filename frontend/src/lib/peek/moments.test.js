import { describe, it, expect } from 'vitest'
import { setFace, isSetPR, missedTwice, restState, journeySteps, finishVerdict, IDLE_MIN } from './moments.js'
import { pickLine, LINES } from './lines.js'
import { seeded } from './coach.js'

const entry = (sets, target = { reps: 5, weight: 100 }) => ({ id: 'bench', target, sets })

describe('setFace', () => {
  const rng = () => 0.1
  it('reads short, on target and beaten sets', () => {
    expect(setFace({ w: 100, r: 3 }, { reps: 5 }, 'reps', rng)).toMatch(/skeptical/)
    expect(setFace({ w: 100, r: 5 }, { reps: 5, weight: 100 }, 'reps', rng)).toBe('joyful-wide')
    expect(setFace({ w: 100, r: 7 }, { reps: 5 }, 'reps', rng)).toBe('surprised-wide-left')
    expect(setFace({ w: 105, r: 5 }, { reps: 5, weight: 100 }, 'reps', rng)).toBe('surprised-wide-left')
    expect(setFace({ sec: 30 }, { sec: 45 }, 'time', rng)).toMatch(/skeptical/)
    expect(setFace({ min: 20 }, {}, 'cardio', rng)).toBe('joyful-wide')
  })
})

describe('isSetPR', () => {
  it('fires on the first set past the best, once', () => {
    const e = entry([{ w: 100, r: 5, done: true }, { w: 105, r: 5, done: true }, { w: 105, r: 5, done: true }])
    expect(isSetPR(e, 0, 102.5)).toBe(false)
    expect(isSetPR(e, 1, 102.5)).toBe(false)   // set 3 is also past it — only a lone first crossing counts
    const e2 = entry([{ w: 100, r: 5, done: true }, { w: 105, r: 5, done: true }, { w: 105, r: 5, done: false }])
    expect(isSetPR(e2, 1, 102.5)).toBe(true)
  })
  it('needs a best to beat', () => {
    expect(isSetPR(entry([{ w: 60, r: 5, done: true }]), 0, 0)).toBe(false)
  })
})

describe('missedTwice', () => {
  it('needs this set and the last done set both short', () => {
    const e = entry([{ w: 100, r: 5, done: true }, { w: 100, r: 4, done: true }, { w: 100, r: 3, done: true }])
    expect(missedTwice(e, 1, 'reps')).toBe(false)
    expect(missedTwice(e, 2, 'reps')).toBe(true)
    expect(missedTwice(e, 2, 'time')).toBe(false)
  })
})

describe('restState', () => {
  const base = { lastSetAt: 0, restSec: 90, resting: false, allDone: false }
  it('stays quiet while resting, done, or within twice the rest', () => {
    expect(restState({ ...base, now: 170e3 })).toBe(null)
    expect(restState({ ...base, now: 500e3, resting: true })).toBe(null)
    expect(restState({ ...base, now: 500e3, allDone: true })).toBe(null)
  })
  it('calls out a long rest, then idling', () => {
    expect(restState({ ...base, now: 181e3 })).toBe('restLong')
    expect(restState({ ...base, now: IDLE_MIN * 60e3 })).toBe('idle')
  })
})

describe('journeySteps', () => {
  it('tells the whole story on a PR day and gets out of the way on a normal one', () => {
    expect(journeySteps({ prs: ['bench'], diff: 100, hasNext: true })).toEqual(['done', 'numbers', 'record', 'trained', 'next', 'verdict', 'summary'])
    expect(journeySteps({ diff: -10 })).toEqual(['done', 'numbers', 'summary'])
    expect(journeySteps({ diff: 50 })).toEqual(['done', 'numbers', 'verdict', 'summary'])
  })
  it('has its own shape for a first session and an early finish', () => {
    expect(journeySteps({ first: true, prs: ['x'] })[1]).toBe('first')
    expect(journeySteps({ early: true, prs: ['x'] })).toEqual(['done', 'numbers', 'record', 'skipped', 'verdict', 'summary'])
    expect(journeySteps({ early: true })).not.toContain('record')
  })
  it('always starts at done and ends at the summary', () => {
    for (const x of [{}, { first: true }, { early: true }, { e1prs: [1] }]) {
      const s = journeySteps(x)
      expect(s[0]).toBe('done')
      expect(s[s.length - 1]).toBe('summary')
    }
  })
})

describe('finishVerdict', () => {
  const rng = seeded('v')
  it('matches tone and mood to the session', () => {
    expect(finishVerdict({ early: true, left: 8 }, rng)).toMatchObject({ tone: 'bad', mood: 'angry' })
    expect(finishVerdict({ early: true, left: 8 }, rng, { honesty: 'gentle' }).mood).toBe('disappointed')
    expect(finishVerdict({ prNames: ['Bench press'] }, rng)).toMatchObject({ tone: 'good', mood: 'proud' })
    expect(finishVerdict({ prNames: ['a', 'b'] }, rng).mood).toBe('celebrate')
    expect(finishVerdict({ diff: 500, prev: 9000, diffText: '500 kg' }, rng).tone).toBe('good')
    expect(finishVerdict({ diff: -3000, prev: 9000 }, rng).tone).toBe('bad')
    expect(finishVerdict({ diff: -100, prev: 9000 }, rng).tone).toBe('meh')
  })
  it('puts a new bond stage ahead of a milestone', () => {
    const v = finishVerdict({ diff: 10, prev: 100, events: [{ k: 'milestone', n: 10 }, { k: 'stageUp', stage: 2 }] }, rng)
    expect(v.sub).toBe("Okay. We're a team now.")
  })
  it('fills the numbers into the line', () => {
    expect(finishVerdict({ early: true, left: 8 }, seeded('n'), { honesty: 'brutal' }).line).not.toMatch(/\{\d\}/)
  })
})

describe('pickLine', () => {
  it('respects bond stage and honesty, and avoids what it just said', () => {
    for (let i = 0; i < 50; i++) {
      const r = seeded('x' + i)
      expect(pickLine('reunion', [9], r, { stage: 0 }).text).not.toMatch(/9 days/)
      expect(pickLine('missedTwice', [], r, { honesty: 'gentle' }).key).not.toMatch(/Don't make it three/)
      expect(pickLine('missedTwice', [], r, { honesty: 'brutal' }).key).not.toMatch(/nobody is watching/)
    }
    expect(pickLine('lastSet', [], () => 0, { said: [LINES.lastSet[0]] }).key).not.toBe(LINES.lastSet[0])
  })
  it('never leaves a placeholder behind for any situation', () => {
    for (const sit of Object.keys(LINES)) {
      for (let st = 0; st <= 3; st++) {
        const l = pickLine(sit, ['A', 'B'], seeded(sit + st), { stage: st })
        if (l) expect(l.text).not.toMatch(/\{\d\}/)
      }
    }
  })
})
