import { describe, it, expect } from 'vitest'
import { SCENARIOS } from './scenarios.js'
import { progressVerdict, setVsLast } from '../lib/verdict.js'
import { lastEntryFor } from '../lib/history.js'
import { weekActions, muscleGaps, dayAction, weighAction } from '../lib/statsActions.js'

// a few different days, so a scenario can't only work on the day it was written
const DAYS = ['2026-10-10T09:00:00', '2026-03-02T21:30:00', '2027-01-01T12:00:00'].map(d => new Date(d))

describe('device scenarios', () => {
  for (const sc of Object.values(SCENARIOS)) {
    if (!sc.verdict) continue
    it(`"${sc.label}" shows the orb ${sc.verdict}`, () => {
      for (const now of DAYS) expect(progressVerdict(sc.state(now), now).state).toBe(sc.verdict)
    })
  }

  it('fresh start is an empty profile', () => {
    expect(SCENARIOS.fresh.state(new Date())).toBe(null)
  })

  it('busy week gives every kind of suggestion something to say, on any weekday that still has a plan ahead', () => {
    // Monday to Thursday: the week still has planned sessions to add sets to
    for (const day of ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']) {
      const now = new Date(day + 'T09:00:00')
      const S = SCENARIOS.busy.state(now)
      expect(S.workouts.every(w => w.d < day)).toBe(true)
      const { items } = weekActions(S, now)
      expect(items.map(i => i.kind)).toEqual(expect.arrayContaining(['lift', 'muscle', 'day']))
      expect(items.find(i => i.kind === 'lift').x.id).toBe('0091')          // overhead press, flat
      expect(muscleGaps(S, now).map(g => g.m)).toContain('hamstring')
      expect(dayAction(S, now)).toMatchObject({ from: 4, to: 5, routine: 'Legs' })
      expect(weighAction(S, now)).toEqual({ kind: 'weigh', days: 9 })
    }
  })

  it('mid-workout has one set to beat, one to match and one to fall short of', () => {
    const S = SCENARIOS.workout.state(DAYS[0])
    const prev = lastEntryFor(S, S.active.entries[0].id)
    expect(S.active.entries[0].sets.map((s, i) => setVsLast(s, prev.sets[i]))).toEqual(['beat', 'match', 'short'])
  })
})
