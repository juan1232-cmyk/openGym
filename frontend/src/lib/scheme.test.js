import { describe, it, expect } from 'vitest'
import { EXDB } from './exercises.js'
import { repRangeOf } from './history.js'
import { withRepRange, isCompound, suggestScheme, followsSuggestion, applySuggestion, REP_CHOICES } from './scheme.js'

const byName = n => EXDB.find(e => e.n === n)
const BENCH = byName('barbell bench press')
const FLY = byName('dumbbell fly')
const PULLUP = byName('pull-up')
const CARDIO = EXDB.find(e => e.bp === 'cardio')

describe('withRepRange', () => {
  it('turns a range on a loaded lift into double progression', () => {
    const c = withRepRange({ id: BENCH.id, sets: 3, reps: 10, weight: 60 }, 8, 12)
    expect(c).toMatchObject({ reps: 12, repsMin: 8, prog: 'double', weight: 60 })
    expect(repRangeOf(c)).toEqual({ lo: 8, hi: 12 })
  })

  it('turns a range on bodyweight work into a ceiling to climb to', () => {
    const c = withRepRange({ id: PULLUP.id, sets: 3, reps: 10, weight: 0 }, 6, 10)
    expect(c).toMatchObject({ reps: 6, repsMax: 10 })
    expect(c.prog).toBeUndefined()
    expect(repRangeOf(c)).toEqual({ lo: 6, hi: 10 })
  })

  it('treats a belted pull-up as a loaded lift', () => {
    const c = withRepRange({ id: PULLUP.id, sets: 3, reps: 10, weight: 10 }, 6, 10)
    expect(c).toMatchObject({ reps: 10, repsMin: 6, prog: 'double' })
  })

  it('makes a single number plain reps again, dropping a range and its double progression', () => {
    const c = withRepRange({ id: BENCH.id, reps: 12, repsMin: 8, prog: 'double' }, 5, 5)
    expect(c.reps).toBe(5)
    expect(c.repsMin).toBeUndefined()
    expect(c.prog).toBeUndefined()
    expect(withRepRange({ id: BENCH.id, reps: 10, prog: 'greyskull' }, 5, 5).prog).toBe('greyskull')
  })

  it('keeps per-side totals even and accepts the ends in either order', () => {
    const c = withRepRange({ id: BENCH.id, reps: 10, side: true }, 15, 9)
    expect(repRangeOf(c)).toEqual({ lo: 10, hi: 16 })
  })
})

describe('suggestScheme', () => {
  it('tells big lifts from isolation work', () => {
    expect(isCompound(BENCH)).toBe(true)
    expect(isCompound(PULLUP)).toBe(true)
    expect(isCompound(FLY)).toBe(false)
    expect(isCompound(byName('lever standing calf raise'))).toBe(false)
  })

  it('fits the goal', () => {
    expect(suggestScheme('muscle', BENCH)).toEqual({ sets: 3, lo: 6, hi: 8 })
    expect(suggestScheme('muscle', FLY)).toEqual({ sets: 3, lo: 10, hi: 15 })
    expect(suggestScheme('strength', BENCH)).toEqual({ sets: 5, lo: 5, hi: 5 })
    expect(suggestScheme('fat', FLY)).toEqual({ sets: 3, lo: 12, hi: 15 })
    expect(suggestScheme(null, BENCH)).toEqual({ sets: 3, lo: 8, hi: 12 })
    expect(suggestScheme('own', FLY)).toEqual({ sets: 3, lo: 8, hi: 12 })
  })

  it('only ever suggests a range the pickers offer as a chip', () => {
    for (const goal of ['muscle', 'strength', 'fat', 'consistent', null])
      for (const ex of [BENCH, FLY]) {
        const s = suggestScheme(goal, ex)
        expect(REP_CHOICES.some(([a, b]) => a === s.lo && b === s.hi)).toBe(true)
      }
  })

  it('leaves cardio and timed holds alone', () => {
    expect(suggestScheme('muscle', CARDIO)).toBe(null)
    expect(suggestScheme('muscle', BENCH, { mode: 'time', sec: 45 })).toBe(null)
  })

  it('applies to sets and reps only, and knows when it already matches', () => {
    const cfg = { id: BENCH.id, sets: 4, reps: 8, weight: 60 }
    expect(followsSuggestion(cfg, BENCH, 'muscle')).toBe(false)
    const done = applySuggestion(cfg, BENCH, 'muscle')
    expect(done).toMatchObject({ sets: 3, reps: 8, repsMin: 6, weight: 60, prog: 'double' })
    expect(followsSuggestion(done, BENCH, 'muscle')).toBe(true)
    expect(followsSuggestion({ id: CARDIO.id, sets: 1, min: 20 }, CARDIO, 'muscle')).toBe(true)
  })
})
