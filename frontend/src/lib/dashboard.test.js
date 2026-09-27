import { describe, it, expect } from 'vitest'
import { weeklyVolumes, volumeBars, partOfDay } from './dashboard.js'

// Wednesday 23 Sep 2026 — the date in the design's mock
const TODAY = new Date('2026-09-23T09:00:00')

describe('weeklyVolumes', () => {
  it('returns n weeks, oldest first, ending with the current week', () => {
    const w = weeklyVolumes([], 8, TODAY)
    expect(w).toHaveLength(8)
    expect(w.every(x => x.vol === 0)).toBe(true)
    expect(new Set(w.map(x => x.wk)).size).toBe(8)
  })

  it('sums every workout into its Monday-to-Sunday week', () => {
    const w = weeklyVolumes([
      { d: '2026-09-21', vol: 9840 },   // Mon, this week
      { d: '2026-09-23', vol: 100 },    // Wed, this week
      { d: '2026-09-20', vol: 14200 },  // Sun, last week
      { d: '2026-09-14', vol: 50 }      // Mon, last week
    ], 8, TODAY)
    expect(w[7].vol).toBe(9940)
    expect(w[6].vol).toBe(14250)
  })

  it('leaves out workouts older than the window and ones without a volume', () => {
    const w = weeklyVolumes([{ d: '2025-01-06', vol: 999 }, { d: '2026-09-22' }], 8, TODAY)
    expect(w.reduce((a, x) => a + x.vol, 0)).toBe(0)
  })
})

describe('volumeBars', () => {
  const weeks = v => v.map((vol, i) => ({ wk: String(i), vol }))

  it('scales to the tallest week and marks the current one', () => {
    const b = volumeBars(weeks([50, 100, 25]))
    expect(b.map(x => x.h)).toEqual([0.5, 1, 0.25])
    expect(b.map(x => x.cur)).toEqual([false, false, true])
  })

  it('marks the best week only when it is not the current week', () => {
    expect(volumeBars(weeks([50, 100, 25])).map(x => x.best)).toEqual([false, true, false])
    expect(volumeBars(weeks([50, 20, 100])).some(x => x.best)).toBe(false)
  })

  it('marks nothing and draws nothing for a chart with no training', () => {
    const b = volumeBars(weeks([0, 0, 0]))
    expect(b.every(x => x.h === 0 && !x.best)).toBe(true)
  })
})

describe('partOfDay', () => {
  it('splits the day at 5, 12 and 18, with the small hours as evening', () => {
    expect([5, 11, 12, 17, 18, 23, 0, 4].map(partOfDay))
      .toEqual(['morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'evening', 'evening'])
  })
})
