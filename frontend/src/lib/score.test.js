import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { scoresOf, scoreOf, reasonOf, roundScore } from './score.js'
import { ratingOf, targetsOf, targetFor, ratedFor, ratingsReady, setRatings, loadRatings, TARGETS } from './ratings.js'
import PACKED from './ratings-data.json'
import { EXIDX } from './exercises.js'
import { musclesOf } from './muscles.js'

// The spec's own check: S9 L9 St8 P8 T2 C2 (the overhead cable triceps extension) → H 77,
// H_eff 71, Str 54, score 67.
const CHECK = { S: 9, L: 9, St: 8, P: 8, T: 2, C: 2 }

describe('scoresOf', () => {
  it('reproduces the spec’s check value', () => {
    const s = scoresOf(CHECK)
    expect(s.H).toBeCloseTo(76.95, 5)
    expect(s.Heff).toBeCloseTo(70.794, 3)
    expect(s.Str).toBeCloseTo(54, 5)
    expect(roundScore(s.score)).toBe(67)
    expect([roundScore(s.H), roundScore(s.Heff), roundScore(s.Str)]).toEqual([77, 71, 54])
  })

  it('treats the limiter as a gate on the muscle score, not a term in it', () => {
    // halving L halves H whatever the other ratings are — and moves Str only by its 10 % share
    const full = scoresOf({ ...CHECK, L: 10 }), half = scoresOf({ ...CHECK, L: 5 })
    expect(half.H).toBeCloseTo(full.H / 2, 5)
    expect(full.Str - half.Str).toBeCloseTo(5, 5)
    expect(scoresOf({ ...CHECK, L: 0 }).H).toBe(0)
  })

  it('takes 20 % off for joint comfort under 5, and only under 5', () => {
    const base = scoresOf(CHECK).score
    expect(scoresOf(CHECK, 4).score).toBeCloseTo(base * 0.8, 5)
    expect(scoresOf(CHECK, 4).sore).toBe(true)
    expect(scoresOf(CHECK, 5).score).toBeCloseTo(base, 5)
    expect(scoresOf(CHECK, 0).score).toBeCloseTo(base * 0.8, 5)
    // H and Str describe the exercise; only the final score is personal
    expect(scoresOf(CHECK, 2).H).toBeCloseTo(scoresOf(CHECK).H, 5)
  })
})

describe('roundScore', () => {
  it('rounds like Python — halves go to the even number — so it matches the spec’s numbers', () => {
    expect([0.5, 1.5, 2.5, 3.5, 66.6, 70.4].map(roundScore)).toEqual([0, 2, 2, 4, 67, 70])
  })
})

// The ratings file is the source of truth and lives outside the app (scripts/peek-scoring), so
// this runs where the whole repo is checked out and is skipped where only frontend/ is.
const SRC = new URL('../../../scripts/peek-scoring/exercise-ratings.json', import.meta.url)
describe.skipIf(!existsSync(SRC))('against scripts/peek-scoring/exercise-ratings.json', () => {
  const rated = existsSync(SRC) ? JSON.parse(readFileSync(SRC, 'utf8')).filter(r => !r.skip) : []

  it('holds all 1,082 rated exercises, and nothing else', () => {
    expect(rated).toHaveLength(1082)
    expect(Object.keys(PACKED).sort()).toEqual(rated.map(r => r.exId).sort())
  })

  it('packs every rating unchanged (re-run scripts/peek-scoring/pack.mjs if this fails)', () => {
    for (const r of rated) {
      expect(targetsOf(r.exId), r.name).toEqual(r.targets.map(t => t.muscle))
      for (const t of r.targets) {
        expect(ratingOf(r.exId, t.muscle), r.name + ' ' + t.muscle).toMatchObject({
          S: t.S, L: t.L, St: r.St, P: r.P, T: r.T, C: r.C, studied: r.studied, secondary: r.secondary
        })
      }
    }
  })

  it('scores every exercise, for every target, exactly as the spec’s code does', () => {
    for (const r of rated) {
      for (const t of r.targets) {
        const s = scoreOf(r.exId, undefined, t.muscle), want = r.scores[t.muscle]
        const got = { H: roundScore(s.H), H_eff: roundScore(s.Heff), Str: roundScore(s.Str), score: roundScore(s.score) }
        expect(got, r.name + ' ' + t.muscle).toEqual(want)
      }
    }
  })
})

describe('ratings data', () => {
  const ids = Object.keys(PACKED)
  const whole = v => Number.isInteger(v) && v >= 0 && v <= 10

  it('is whole-number ratings 0–10 for muscles the app can name', () => {
    for (const id of ids) {
      const r = PACKED[id]
      for (const k of ['St', 'P', 'T', 'C']) expect(whole(r[k]), id + ' ' + k).toBe(true)
      r.t.forEach(([m, S, L]) => {
        expect(TARGETS[m], id + ' ' + m).toBeTruthy()
        expect(whole(S) && whole(L), id + ' ' + m).toBe(true)
      })
      ;(r.x || []).forEach(m => expect(TARGETS[m], id + ' secondary ' + m).toBeTruthy())
    }
  })

  it('points every rating at an exercise in the dataset', () => {
    ids.forEach(id => expect(EXIDX[id], id).toBeTruthy())
  })

  it('rates a muscle the dataset says the exercise trains, bar a few', () => {
    // "Trains", not "targets": the dataset files the RDL and hack squat under glutes, while the
    // spec rates them for the hamstrings and quads they also hit. This just keeps the mismatches
    // from growing unnoticed.
    const off = ids.filter(id => !musclesOf(EXIDX[id])[TARGETS[PACKED[id].t[0][0]].slug])
    expect(off.length).toBeLessThan(ids.length * 0.05)
  })
})

describe('the table loads on demand', () => {
  afterEach(() => setRatings(PACKED))

  it('answers "not rated" until it arrives, then scores', async () => {
    setRatings(null)
    expect(ratingsReady()).toBe(false)
    expect(scoreOf('0194')).toBeNull()
    expect(ratedFor('triceps')).toEqual([])
    await loadRatings()
    expect(ratingsReady()).toBe(true)
    expect(Math.round(scoreOf('0194').score)).toBe(67)
  })
})

describe('scoreOf', () => {
  it('scores rated exercises and stays silent for the rest', () => {
    expect(Math.round(scoreOf('0194').score)).toBe(67)
    expect(scoreOf('0194')).toMatchObject({ muscle: 'triceps', S: 9, L: 9, St: 8, P: 8, T: 2, C: 2 })
    expect(scoreOf('0001').muscle).toBe('abs')
    expect(scoreOf('nope')).toBeNull()
  })

  it('leaves out what the spec leaves out: stretches, drills, cardio', () => {
    expect(scoreOf('1512')).toBeNull()      // all fours squad stretch
  })

  it('scores a two-muscle exercise once per target, main one by default', () => {
    expect(targetsOf('1326')).toEqual(['lats', 'biceps'])
    const lats = scoreOf('1326'), biceps = scoreOf('1326', undefined, 'biceps')
    expect(lats).toMatchObject({ muscle: 'lats', S: 7, L: 5 })
    expect(biceps).toMatchObject({ muscle: 'biceps', S: 6, L: 7 })
    expect(biceps.St).toBe(lats.St)          // the rest describes the exercise, not the muscle
    expect(biceps.score).not.toBe(lats.score)
    expect(scoreOf('1326', undefined, 'triceps')).toBeNull()
  })
})

describe('target muscles', () => {
  it('maps the spec’s finer muscles onto the body map’s', () => {
    const slugs = ['upper_chest', 'front_delts', 'side_delts', 'rear_delts', 'lats', 'upper_back', 'hamstrings', 'glutes'].map(m => TARGETS[m].slug)
    expect(slugs).toEqual(['chest', 'deltoids', 'deltoids', 'deltoids', 'upper-back', 'upper-back', 'hamstring', 'gluteal'])
  })
  it('finds the target that counts toward a body-map muscle', () => {
    expect(targetFor('1326', 'biceps')).toBe('biceps')
    expect(targetFor('1326', 'upper-back')).toBe('lats')
    expect(targetFor('1326', 'quadriceps')).toBe('lats')     // none does: the main target
    expect(targetFor('1512', 'chest')).toBeNull()
  })
})

describe('reasonOf', () => {
  it('warns about cost before praising anything', () => {
    expect(reasonOf(ratingOf('0043'))).toBe('Very tiring for the whole body')
  })
  it('otherwise names the best muscle-building quality', () => {
    expect(reasonOf(ratingOf('0194'))).toBe('Hard at the stretch')
    expect(reasonOf(ratingOf('0585'))).toBe('The target muscle gives out first')
  })
})
