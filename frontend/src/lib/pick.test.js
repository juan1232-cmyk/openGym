import { describe, it, expect } from 'vitest'
import { EXDB, EXIDX } from './exercises.js'
import {
  searchExercises, primaryOf, muscleChips, matchesMuscle, recentIds, usageOf, gymFilter,
  overlapFor, suggestionFor, similarTo, OVERLAP_AT,
} from './pick.js'

// Real exercises out of the shipped catalogue, looked up by name so the tests read like the UI.
const byName = n => { const e = EXDB.find(x => x.n === n); if (!e) throw new Error('no ' + n); return e }
const names = list => list.map(e => e.n)
const BENCH = byName('barbell bench press')
const INCLINE = byName('dumbbell incline bench press')
const FLY = byName('dumbbell fly')

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

describe('overlap', () => {
  const two = [{ id: BENCH.id }, { id: INCLINE.id }]
  it(`warns from the ${OVERLAP_AT + 1}th exercise for the same muscle, not before`, () => {
    expect(overlapFor([{ id: BENCH.id }], FLY.id)).toBe(null)
    expect(overlapFor(two, FLY.id)).toEqual({ muscle: 'chest', ids: [BENCH.id, INCLINE.id] })
  })

  it('does not count the exercise against itself', () => {
    expect(overlapFor([...two, { id: FLY.id }], BENCH.id).ids).toEqual([INCLINE.id, FLY.id])
  })

  it('suggests a neglected muscle from the same day, within the gym\'s kit', () => {
    const s = suggestionFor(two, FLY.id, EXDB)
    expect(['deltoids', 'triceps']).toContain(s.muscle)
    expect(primaryOf(s.ex)).toBe(s.muscle)
    const dbOnly = suggestionFor(two, FLY.id, EXDB, { gymEq: ['dumbbell'] })
    expect(['dumbbell', 'body weight']).toContain(dbOnly.ex.eq)
  })

  it('stays quiet about a muscle the list already trains', () => {
    const tri = EXDB.filter(e => primaryOf(e) === 'triceps').slice(0, 2)
    const sh = EXDB.filter(e => primaryOf(e) === 'deltoids').slice(0, 2)
    const full = [...two, ...tri, ...sh].map(e => ({ id: e.id }))
    expect(suggestionFor(full, FLY.id, EXDB)).toEqual({ overlap: expect.objectContaining({ muscle: 'chest' }) })
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
