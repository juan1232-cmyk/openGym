import { describe, it, expect } from 'vitest'
import { EXDB, EXIDX } from './exercises.js'
import {
  searchExercises, primaryOf, muscleChips, matchesMuscle, recentIds, usageOf, gymFilter,
  overlapFor, suggestionFor, similarTo, OVERLAP_AT, regionOf, browseOrder, STAPLES,
} from './pick.js'

// Real exercises out of the shipped catalogue, looked up by name so the tests read like the UI.
const byName = n => { const e = EXDB.find(x => x.n === n); if (!e) throw new Error('no ' + n); return e }
const names = list => list.map(e => e.n)
const BENCH = byName('barbell bench press')
const INCLINE = byName('dumbbell incline bench press')
const FLY = byName('dumbbell fly')
const DB_BENCH = byName('dumbbell bench press')

describe('searchExercises', () => {
  it('matches words in any order', () => {
    const a = names(searchExercises(EXDB, 'row dumbbell'))
    const b = names(searchExercises(EXDB, 'dumbbell row'))
    expect(a).toContain('dumbbell bent over row')
    expect(a).toEqual(b)
  })

  it('expands the abbreviations people type', () => {
    expect(names(searchExercises(EXDB, 'db row'))).toEqual(names(searchExercises(EXDB, 'dumbbell row')))
    expect(names(searchExercises(EXDB, 'rdl'))).toContain('barbell romanian deadlift')
    expect(names(searchExercises(EXDB, 'pullup'))).toContain('pull-up')
  })

  it('matches the start of a word, not the middle — "row" is not "narrow"', () => {
    const r = searchExercises(EXDB, 'row')
    expect(r.length).toBeGreaterThan(0)
    expect(names(r)).not.toContain('barbell narrow stance squat')
  })

  it('puts the plain lift ahead of its variations', () => {
    expect(names(searchExercises(EXDB, 'bench press')).slice(0, 2)).toEqual(['barbell bench press', 'dumbbell bench press'])
    expect(searchExercises(EXDB, 'curl')[0].n).toBe('barbell curl')
    expect(searchExercises(EXDB, 'barbell bench press')[0]).toBe(BENCH)
  })

  it('lifts the exercises you already use', () => {
    const plain = searchExercises(EXDB, 'bench press')
    const pick = plain[5]
    const boosted = searchExercises(EXDB, 'bench press', { usage: { [pick.id]: 5 } })
    expect(boosted.indexOf(pick)).toBeLessThan(5)
  })

  it('returns the list untouched without a query', () => {
    expect(searchExercises(EXDB, '   ')).toBe(EXDB)
  })
})

describe('muscles', () => {
  it('reads the main muscle through the dataset spellings', () => {
    expect(primaryOf(BENCH)).toBe('chest')
    expect(primaryOf(byName('barbell curl'))).toBe('biceps')
    expect(primaryOf({ id: 'c1', n: 'x', bp: 'upper legs', tg: '', custom: true })).toBe('quadriceps')
    expect(primaryOf({ id: 'c2', n: 'x', bp: 'cardio', tg: '' })).toBe(null)
  })

  it('offers chips only for muscles with exercises behind them, cardio last', () => {
    const chips = muscleChips(EXDB)
    expect(chips[0]).toBe('chest')
    expect(chips[chips.length - 1]).toBe('cardio')
    expect(muscleChips([BENCH])).toEqual(['chest'])
    expect(matchesMuscle(BENCH, 'chest')).toBe(true)
    expect(matchesMuscle(BENCH, 'biceps')).toBe(false)
    expect(matchesMuscle(BENCH, '')).toBe(true)
  })
})

describe('recentIds / usageOf', () => {
  const st = {
    routines: [{ ex: [{ id: 'a' }, { id: 'z' }] }],
    workouts: [{ d: '2026-09-01', entries: [{ id: 'a' }] }, { d: '2026-09-20', entries: [{ id: 'b' }, { id: 'a' }] }],
  }
  it('lists the latest workout first, then planned-only exercises, once each', () => {
    expect(recentIds(st)).toEqual(['b', 'a', 'z'])
  })
  it('counts routines and workouts', () => {
    expect(usageOf(st)).toEqual({ a: 3, z: 1, b: 1 })
  })
})

describe('gymFilter', () => {
  it('hides missing kit but never bodyweight or your own exercises', () => {
    const custom = { id: 'c', n: 'mine', eq: 'custom', custom: true }
    const pushup = EXDB.find(e => e.eq === 'body weight')
    const smith = EXDB.find(e => e.eq === 'smith machine')
    const out = gymFilter([BENCH, smith, pushup, custom], ['barbell'])
    expect(out).toEqual([BENCH, pushup, custom])
    expect(gymFilter([smith], null)).toEqual([smith])
  })
})

describe('regionOf', () => {
  it('splits the chest by angle', () => {
    expect(regionOf(BENCH)).toBe('Mid chest')
    expect(regionOf(INCLINE)).toBe('Upper chest')
    expect(regionOf(byName('barbell decline bench press'))).toBe('Lower chest')
    expect(regionOf(byName('chest dip'))).toBe('Lower chest')
  })

  it('splits the shoulders into front, side and rear', () => {
    expect(regionOf(byName('dumbbell seated shoulder press'))).toBe('Front delts')
    expect(regionOf(byName('barbell front raise'))).toBe('Front delts')
    expect(regionOf(byName('dumbbell lateral raise'))).toBe('Side delts')
    expect(regionOf(byName('dumbbell rear fly'))).toBe('Rear delts')
  })

  it('splits abs and back, and names the rest plainly', () => {
    expect(regionOf(byName('hanging leg raise'))).toBe('Lower abs')
    expect(regionOf(byName('russian twist'))).toBe('Obliques')
    expect(regionOf(byName('crunch floor'))).toBe('Upper abs')
    expect(regionOf(byName('pull-up'))).toBe('Lats')
    expect(regionOf(byName('barbell bent over row'))).toBe('Mid back')
    expect(regionOf(byName('barbell curl'))).toBe('Biceps')
    expect(regionOf(EXDB.find(e => e.bp === 'cardio'))).toBe('Cardio')
  })
})

describe('browseOrder', () => {
  const triceps = EXDB.filter(e => matchesMuscle(e, 'triceps'))
  it('opens a muscle on its staple lifts, not on oddities', () => {
    expect(browseOrder(triceps)[0].n).toBe('cable pushdown')
  })
  it('puts what you train first, most recent first', () => {
    const kick = byName('dumbbell kickback')
    expect(browseOrder(triceps, { recent: [kick.id] })[0]).toBe(kick)
  })
  it('sinks stretches to the bottom', () => {
    const chest = browseOrder(EXDB.filter(e => matchesMuscle(e, 'chest')))
    const firstStretch = chest.findIndex(e => /stretch/.test(e.n))
    expect(chest.slice(firstStretch).every(e => /stretch|male|female|pov/.test(e.n))).toBe(true)
  })
  it('only names staples that exist in the dataset', () => {
    expect(STAPLES.filter(n => !EXDB.some(e => e.n === n))).toEqual([])
  })
})

describe('overlap', () => {
  const two = [{ id: BENCH.id }, { id: DB_BENCH.id }]
  it(`warns from the ${OVERLAP_AT + 1}th exercise for the same part of a muscle, not before`, () => {
    expect(overlapFor([{ id: BENCH.id }], FLY.id)).toBe(null)
    expect(overlapFor(two, FLY.id)).toEqual({ region: 'Mid chest', muscle: 'chest', ids: [BENCH.id, DB_BENCH.id] })
  })

  it('does not call an incline press a repeat of two flat ones', () => {
    expect(overlapFor(two, INCLINE.id)).toBe(null)
  })

  it('does not count the exercise against itself', () => {
    expect(overlapFor([...two, { id: FLY.id }], BENCH.id).ids).toEqual([DB_BENCH.id, FLY.id])
  })

  it('suggests a part of the same muscle the list does not train yet', () => {
    const s = suggestionFor(two, FLY.id, EXDB)
    expect(primaryOf(s.ex)).toBe('chest')
    expect(regionOf(s.ex)).toBe('Upper chest')
  })

  it('moves on to a neglected neighbour when the muscle has no other part, within the gym\'s kit', () => {
    const curls = [{ id: byName('barbell curl').id }, { id: byName('dumbbell biceps curl').id }]
    const hammer = byName('dumbbell hammer curl')
    const s = suggestionFor(curls, hammer.id, EXDB)
    expect(s.overlap.region).toBe('Biceps')
    expect(['upper-back', 'trapezius']).toContain(primaryOf(s.ex))
    const dbOnly = suggestionFor(curls, hammer.id, EXDB, { gymEq: ['dumbbell'] })
    expect(['dumbbell', 'body weight']).toContain(dbOnly.ex.eq)
  })

  it('stays quiet about helpers a crowded day already trains', () => {
    const full = [{ id: BENCH.id }, { id: DB_BENCH.id }, { id: INCLINE.id }, { id: byName('chest dip').id }]
    expect(suggestionFor(full, FLY.id, EXDB)).toEqual({ overlap: expect.objectContaining({ region: 'Mid chest' }) })
  })

  it('returns null without an overlap', () => {
    expect(suggestionFor([], FLY.id, EXDB)).toBe(null)
  })
})

describe('similarTo', () => {
  it('keeps the muscle, leaves out the exercise and the list, and puts the same movement first', () => {
    const r = similarTo(BENCH, EXDB, { exclude: [INCLINE.id] })
    expect(r).not.toContain(BENCH)
    expect(r).not.toContain(INCLINE)
    expect(r.every(e => primaryOf(e) === 'chest')).toBe(true)
    expect(r[0].n).toBe('dumbbell bench press')
  })

  it('respects the gym', () => {
    expect(similarTo(BENCH, EXDB, { gymEq: ['dumbbell'] }).every(e => ['dumbbell', 'body weight'].includes(e.eq))).toBe(true)
  })

  it('swaps cardio for cardio', () => {
    const run = EXDB.find(e => e.bp === 'cardio')
    expect(similarTo(run, EXDB).every(e => e.bp === 'cardio')).toBe(true)
    expect(EXIDX[run.id]).toBe(run)
  })
})
