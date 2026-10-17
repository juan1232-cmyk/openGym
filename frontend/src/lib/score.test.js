import { describe, it, expect } from 'vitest'
import { scoresOf, scoreOf, compare, reasonOf } from './score.js'
import { RATED, RATING_OF } from './ratings.js'
import { EXIDX } from './exercises.js'
import { musclesOf } from './muscles.js'

// The doc's starting table, computed columns: H, H_eff, Str, Score. The doc rounds by hand
// (86.5 shows as 86, 83.5 as 84), so the check allows a point either way.
const DOC = {
  '0592': [80, 77, 54, 71], '0318': [75, 72, 46, 66], '0605': [84, 77, 49, 70], '0594': [64, 62, 51, 59],
  '0227': [78, 72, 51, 67], '0577': [75, 63, 69, 64], '0025': [67, 51, 85, 60], '0599': [90, 83, 59, 77],
  '0586': [78, 72, 56, 68], '0085': [66, 45, 64, 50], '2330': [79, 70, 68, 69], '0585': [86, 80, 60, 75],
  '0743': [82, 62, 74, 65], '0043': [64, 41, 80, 51], '0178': [70, 67, 44, 62], '0334': [52, 50, 40, 48],
  '0194': [86, 80, 54, 73], '0201': [71, 68, 56, 65], '0327': [75, 66, 69, 67],
}

describe('scoresOf', () => {
  it('reproduces the worked example: overhead cable triceps extension', () => {
    const s = scoresOf(RATING_OF['0194'])
    expect(s.H).toBeCloseTo(86.5, 5)
    expect(s.Heff).toBeCloseTo(79.58, 2)
    expect(s.Str).toBeCloseTo(54, 5)
    expect(Math.round(s.score)).toBe(73)
  })

  it('matches every row of the starting table', () => {
    expect(RATED).toHaveLength(19)
    RATED.forEach(r => {
      const s = scoresOf(r), [H, Heff, Str, score] = DOC[r.id]
      expect(Math.abs(s.H - H), r.id + ' H').toBeLessThanOrEqual(1)
      expect(Math.abs(s.Heff - Heff), r.id + ' H_eff').toBeLessThanOrEqual(1)
      expect(Math.abs(s.Str - Str), r.id + ' Str').toBeLessThanOrEqual(1)
      expect(Math.abs(s.score - score), r.id + ' score').toBeLessThanOrEqual(1)
    })
  })

  it('takes 20 % off for joint comfort under 5, and only under 5', () => {
    const r = RATING_OF['0194']
    const base = scoresOf(r).score
    expect(scoresOf(r, 4).score).toBeCloseTo(base * 0.8, 5)
    expect(scoresOf(r, 4).sore).toBe(true)
    expect(scoresOf(r, 5).score).toBeCloseTo(base, 5)
    expect(scoresOf(r, 0).score).toBeCloseTo(base * 0.8, 5)
    // H and Str describe the exercise; only the final score is personal
    expect(scoresOf(r, 2).H).toBeCloseTo(scoresOf(r).H, 5)
  })
})

describe('ratings data', () => {
  // "Trains", not "targets": the dataset files the RDL and hack squat under glutes, while the
  // doc rates them for the hamstrings and quads they also hit.
  it('points every rating at a real exercise that trains that muscle', () => {
    RATED.forEach(r => {
      const ex = EXIDX[r.id]
      expect(ex, r.id).toBeTruthy()
      expect(musclesOf(ex)[r.muscle], r.id + ' ' + ex.n).toBeGreaterThan(0)
    })
  })
})

describe('scoreOf', () => {
  it('scores rated exercises and stays silent for the rest', () => {
    expect(Math.round(scoreOf('0194').score)).toBe(73)
    expect(scoreOf('0001')).toBeNull()
    expect(scoreOf('nope')).toBeNull()
  })
})

describe('compare', () => {
  it('finds the gap the studies found: overhead extension beats pushdown on stretch, 9 vs 4', () => {
    const c = compare('0194', '0201')
    expect(c.win).toBe('a')
    expect(c.gap).toMatchObject({ k: 'S', a: 9, b: 4, win: 'a' })
    const row = k => c.rows.find(r => r.k === k)
    expect(row('L').win).toBeNull()            // same limiter
    expect(row('St').win).toBe('b')
    expect(row('C').win).toBe('b')             // lower cost wins
  })

  it('applies each side its own comfort', () => {
    const c = compare('0194', '0201', { '0194': 2 })
    expect(c.win).toBe('b')
    expect(c.a.sore).toBe(true)
    expect(c.b.sore).toBe(false)
  })

  it('has nothing to say about an unrated exercise', () => {
    expect(compare('0194', '0001')).toBeNull()
  })
})

describe('reasonOf', () => {
  it('warns about cost before praising anything', () => {
    expect(reasonOf(RATING_OF['0043'])).toBe('Very tiring for the whole body')
  })
  it('otherwise names the best muscle-building quality', () => {
    expect(reasonOf(RATING_OF['0194'])).toBe('Hard at the stretch')
    expect(reasonOf(RATING_OF['0585'])).toBe('The target muscle gives out first')
  })
})
