import { describe, it, expect } from 'vitest'
import {
  weekAhead, muscleGaps, muscleAction, applyMuscle, undoMuscle, dayAction, applyDay, undoDay,
  weighAction, weekActions, MAX_ADD_SETS, MAX_ITEMS
} from './statsActions.js'
import { SCENARIOS } from '../device/scenarios.js'
import { allExercises } from './exercises.js'
import { primaryOf } from './pick.js'
import { setRatings } from './ratings.js'
import { isoOf } from './format.js'

// A Thursday. The demo profiles train Mon / Wed / Fri, so Friday is the only day left.
const NOW = new Date('2026-10-22T09:00:00')
const DAY = 864e5
const demo = (name = 'progressing') => JSON.parse(JSON.stringify(SCENARIOS[name].state(NOW)))
// a finished session on the given date
const session = (S, iso, entries = [['0025', 60]]) => S.workouts.push({
  id: 'x' + iso, d: iso, start: new Date(iso + 'T18:00:00').getTime(), routineId: 'demo',
  entries: entries.map(([id, w]) => ({ id, sets: [0, 1, 2].map(() => ({ w, r: 5, done: true })) }))
})
const daysAgo = n => isoOf(new Date(NOW.getTime() - n * DAY))

describe('weekAhead', () => {
  it('counts the days done and the planned days still to come, today included until it is trained', () => {
    const S = demo()
    const a = weekAhead(S, NOW)
    expect(a.left.map(l => l.iso)).toEqual(['2026-10-23'])
    expect(a.done).toBe(2)
    expect(a.planned).toBe(3)
    const fri = weekAhead(S, new Date('2026-10-23T09:00:00'))
    expect(fri.left.map(l => l.iso)).toEqual(['2026-10-23'])
    session(S, '2026-10-23')
    expect(weekAhead(S, new Date('2026-10-23T20:00:00')).left).toEqual([])
  })
})

describe('muscleGaps', () => {
  it('projects the week from what is done plus what the planned days will add', () => {
    const S = demo()
    const g = muscleGaps(S, NOW)
    expect(g.length).toBeGreaterThan(0)
    g.forEach(x => {
      expect(x.projected).toBeLessThan(x.goal)
      expect(x.short).toBe(Math.ceil(x.goal - x.projected))
    })
    expect(g.map(x => x.short)).toEqual([...g.map(x => x.short)].sort((a, b) => b - a))
  })

  it('says nothing once no planned day is left to add the sets to', () => {
    const S = demo()
    S.week = {}
    expect(muscleGaps(S, NOW)).toEqual([])
  })

  it('does not call a muscle short that the coming days already cover', () => {
    const S = demo()
    const before = muscleGaps(S, NOW)
    const m = before[0].m
    const ex = S.routines[0].ex
    // a lot of work for that muscle on Friday closes its gap
    ex.forEach(c => { c.sets = 10 })
    expect(muscleGaps(S, NOW).map(x => x.m)).not.toContain(m)
  })
})

describe('muscleAction', () => {
  it('adds an exercise for the muscle to the coming day, capped, and undo takes it back', () => {
    const S = demo()
    const gap = muscleGaps(S, NOW)[0]
    const act = muscleAction(S, gap, NOW)
    expect(act).toMatchObject({ kind: 'muscle', m: gap.m, rid: 'demo', iso: '2026-10-23' })
    expect(act.sets).toBe(Math.min(MAX_ADD_SETS, gap.short))
    expect(S.routines[0].ex.some(c => c.id === act.ex)).toBe(false)
    const n = S.routines[0].ex.length
    expect(applyMuscle(S, act)).toBe(act)
    expect(S.routines[0].ex).toHaveLength(n + 1)
    expect(S.routines[0].ex.at(-1)).toMatchObject({ id: act.ex, sets: act.sets })
    // the gap it was for is smaller now
    const after = muscleGaps(S, NOW).find(x => x.m === gap.m)
    expect(!after || after.short < gap.short).toBe(true)
    expect(undoMuscle(S, act)).toBe(true)
    expect(S.routines[0].ex).toHaveLength(n)
  })

  it('does not add the same exercise twice, and does not undo what was changed by hand since', () => {
    const S = demo()
    const act = muscleAction(S, muscleGaps(S, NOW)[0], NOW)
    applyMuscle(S, act)
    expect(applyMuscle(S, act)).toBeNull()
    S.routines[0].ex.at(-1).sets = act.sets + 1
    expect(undoMuscle(S, act)).toBe(false)
    expect(S.routines[0].ex.at(-1).sets).toBe(act.sets + 1)
  })

  it('picks the coming day that already works the muscle hardest', () => {
    const S = demo()
    S.routines.push({ id: 'pull', name: 'Pull', ex: [{ id: '0027', sets: 6, reps: 8 }] })
    S.week = { 1: 'demo', 3: 'demo', 5: 'demo', 6: 'pull' }
    const gap = { m: 'upper-back', short: 2 }
    expect(muscleAction(S, gap, NOW).rid).toBe('pull')
    const chest = { m: 'chest', short: 2 }
    expect(muscleAction(S, chest, NOW).rid).toBe('demo')
  })

  it('prefers the exercise Peek rates best for the muscle once the ratings are in', () => {
    const S = demo()
    const gap = { m: 'chest', short: 2 }
    // an empty table, not none: nothing else can load the real one over it mid-test
    setRatings({})
    try {
      const plain = muscleAction(S, gap, NOW).ex
      const rated = allExercises(S).find(e => primaryOf(e) === 'chest' && e.id !== plain && !S.routines[0].ex.some(c => c.id === e.id))
      setRatings({ [rated.id]: { t: [['chest', 9, 9]], St: 9, P: 9, T: 9, C: 0 } })
      expect(muscleAction(S, gap, NOW).ex).toBe(rated.id)
      setRatings({})
      expect(muscleAction(S, gap, NOW).ex).toBe(plain)
    } finally { setRatings(null) }
  })

  it('does not put a muscle on a day that does not train it', () => {
    const S = demo()
    S.routines.push({ id: 'legs', name: 'Legs', ex: [{ id: '0043', sets: 4, reps: 5 }] })
    S.week = { 5: 'legs' }       // only a leg day is left this week
    expect(muscleAction(S, { m: 'chest', short: 4 }, NOW)).toBeNull()
    expect(muscleAction(S, { m: 'upper-back', short: 4 }, NOW)).toBeNull()
    expect(muscleAction(S, { m: 'quadriceps', short: 2 }, NOW)).toMatchObject({ rid: 'legs' })
  })

  it('has nothing to do with no day left, or no exercise the gym has', () => {
    const S = demo()
    S.week = {}
    expect(muscleAction(S, { m: 'chest', short: 2 }, NOW)).toBeNull()
    expect(muscleAction(demo(), { m: 'no-such-muscle', short: 2 }, NOW)).toBeNull()
  })
})

describe('dayAction', () => {
  // eight weeks of Mondays and Wednesdays, never the Friday, and the odd Saturday
  const skipsFriday = saturdays => {
    const S = demo()
    S.workouts = []
    for (let w = 0; w < 8; w++) {
      const mon = new Date('2026-10-19T12:00:00').getTime() - w * 7 * DAY
      session(S, isoOf(new Date(mon)))
      session(S, isoOf(new Date(mon + 2 * DAY)))
      if (saturdays && w % 2) session(S, isoOf(new Date(mon + 5 * DAY)))
    }
    return S
  }

  it('moves the skipped weekday to the free day you already train on', () => {
    const S = skipsFriday(true)
    const act = dayAction(S, NOW)
    expect(act).toMatchObject({ kind: 'day', from: 4, to: 5, rid: 'demo', often: 4 })
    expect(act.missed).toBeGreaterThanOrEqual(2)
  })

  it('falls back to the nearest free day when there is no habit to follow', () => {
    const act = dayAction(skipsFriday(false), NOW)
    expect(act).toMatchObject({ from: 4, to: 5, often: 0 })
  })

  it('moves the session and puts it back', () => {
    const S = skipsFriday(true)
    const act = dayAction(S, NOW)
    expect(applyDay(S, act)).toBe(act)
    expect(S.week[6]).toBe('demo')
    expect(S.week[5]).toBeUndefined()
    expect(applyDay(S, act)).toBeNull()
    expect(undoDay(S, act)).toBe(true)
    expect(S.week[5]).toBe('demo')
    expect(S.week[6]).toBeUndefined()
  })

  it('is null when nothing is skipped or no day is free', () => {
    const kept = skipsFriday(false)
    for (let w = 0; w < 8; w++) session(kept, isoOf(new Date(new Date('2026-10-19T12:00:00').getTime() - w * 7 * DAY + 4 * DAY)))
    expect(dayAction(kept, NOW)).toBeNull()
    const S = skipsFriday(true)
    S.week = { 0: 'demo', 1: 'demo', 2: 'demo', 3: 'demo', 4: 'demo', 5: 'demo', 6: 'demo' }
    expect(dayAction(S, NOW)).toBeNull()
  })
})

describe('weighAction', () => {
  it('asks for a weigh-in only once the last one is a week old', () => {
    const S = demo()
    S.bodyweight = [{ d: daysAgo(3), w: 80 }]
    expect(weighAction(S, NOW)).toBeNull()
    S.bodyweight = [{ d: daysAgo(9), w: 80 }]
    expect(weighAction(S, NOW)).toEqual({ kind: 'weigh', days: 9 })
  })

  it('leaves someone who never tracks weight alone, but not one with a goal and no weigh-in', () => {
    const S = demo()
    expect(weighAction(S, NOW)).toBeNull()
    S.targetW = 75
    expect(weighAction(S, NOW)).toEqual({ kind: 'weigh', days: null })
  })
})

describe('weekActions', () => {
  it('reads the week into a hero and a short, ranked list', () => {
    const S = demo('stalled')
    const { hero, items, more } = weekActions(S, NOW)
    expect(hero).toMatchObject({ done: 2, planned: 3 })
    expect(hero.next).toMatchObject({ iso: '2026-10-23', today: false })
    expect(items.length).toBeLessThanOrEqual(MAX_ITEMS)
    expect(items.length + more).toBeGreaterThan(0)
    // stalled lifts lead
    expect(items[0].kind).toBe('lift')
    const kinds = items.map(i => i.kind)
    expect(kinds).toEqual([...kinds].sort((a, b) => ['lift', 'muscle', 'day', 'weigh'].indexOf(a) - ['lift', 'muscle', 'day', 'weigh'].indexOf(b)))
    expect(new Set(items.map(i => i.key)).size).toBe(items.length)
  })

  it('flags a streak at risk only before anything is trained this week', () => {
    const S = demo()
    expect(weekActions(S, NOW).hero.risk).toBe(false)
    const early = new Date('2026-10-19T08:00:00')   // Monday, nothing yet, last week trained
    const t = demo()
    t.workouts = t.workouts.filter(w => w.d < '2026-10-19')
    expect(weekActions(t, early).hero.risk).toBe(true)
  })

  it('has an empty list for a fresh profile', () => {
    const S = demo()
    S.workouts = []
    S.routines = []
    S.week = {}
    expect(weekActions(S, NOW)).toMatchObject({ hero: { done: 0, planned: 0, next: null, risk: false }, items: [], more: 0 })
  })
})
