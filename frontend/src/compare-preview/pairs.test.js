import { describe, it, expect } from 'vitest'
import { PAIRS } from './pairs.js'
import { compare } from '../lib/score.js'
import { EXIDX } from '../lib/exercises.js'

describe('compare preview pairs', () => {
  it('covers a studied pair, a formula win and an about-the-same pair', () => {
    expect(new Set(PAIRS.map(p => p.kind))).toEqual(new Set(['studied', 'formula', 'same']))
  })

  PAIRS.forEach(p => it(p.label + ' is still the case it shows', () => {
    expect(EXIDX[p.a] && EXIDX[p.b]).toBeTruthy()
    const c = compare(p.a, p.b, {}, p.muscle)
    expect(c, 'both rated for the same muscle').toBeTruthy()
    expect(c.win).toBe(p.expect)
    expect(c.studied).toBe(p.kind === 'studied')
  }))
})
