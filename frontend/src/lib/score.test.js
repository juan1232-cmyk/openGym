import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { scoresOf, scoreOf, compare, reasonOf, ratedAlternatives, roundScore } from './score.js'
import { ratingOf, targetsOf, targetFor, ratedFor, ratingsReady, setRatings, loadRatings, TARGETS } from './ratings.js'
import PACKED from './ratings-data.json'
import { EXIDX } from './exercises.js'
import { musclesOf } from './muscles.js'
import { STUDIED_PAIRS } from './engine-config.js'

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

  it('uses only studied tags that STUDIED_PAIRS knows', () => {
    const known = new Set(STUDIED_PAIRS.flat())
    ids.forEach(id => { if (PACKED[id].y) expect(known.has(PACKED[id].y), id + ' ' + PACKED[id].y).toBe(true) })
  })
})

describe('the table loads on demand', () => {
  afterEach(() => setRatings(PACKED))

  it('answers "not rated" until it arrives, then scores', async () => {
    setRatings(null)
    expect(ratingsReady()).toBe(false)
    expect(scoreOf('0194')).toBeNull()
    expect(ratedFor('triceps')).toEqual([])
    expect(compare('0194', '0201')).toBeNull()
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

describe('ratedAlternatives', () => {
  it('lists the other exercises for the same muscle, best score first', () => {
    const alts = ratedAlternatives('0194')
    expect(alts.length).toBeGreaterThan(20)
    expect(alts.every(a => a.muscle === 'triceps' && a.id !== '0194')).toBe(true)
    expect(alts.map(a => a.score)).toEqual([...alts.map(a => a.score)].sort((a, b) => b - a))
  })
  it('follows the muscle asked for, not just the main one', () => {
    const alts = ratedAlternatives('1326', {}, 'biceps')
    expect(alts.every(a => a.muscle === 'biceps')).toBe(true)
    expect(alts.some(a => a.id === '0139')).toBe(true)
  })
  it('is empty for an unrated exercise', () => {
    expect(ratedAlternatives('1512')).toEqual([])
  })
})

describe('compare', () => {
  it('gives a studied pair to the side the study favours, and explains it by stretch, 9 vs 4', () => {
    const c = compare('0194', '0201')
    expect(c).toMatchObject({ win: 'a', studied: true, muscle: 'triceps' })
    expect(c.why).toMatchObject({ k: 'S', from: 9, to: 4, win: 'a' })
    const row = k => c.rows.find(r => r.k === k)
    expect(row('L').win).toBeNull()            // same limiter
    expect(row('St').win).toBe('b')
    expect(row('C').win).toBe('b')             // lower cost wins
  })

  it('works whichever side the studied winner is on', () => {
    expect(compare('0201', '0194')).toMatchObject({ win: 'b', studied: true })
  })

  it('covers the other studied pairs', () => {
    expect(compare('0599', '0586')).toMatchObject({ win: 'a', studied: true })   // seated over lying leg curl
    expect(compare('0605', '0594')).toMatchObject({ win: 'a', studied: true })   // standing over seated calf raise
  })

  it('lets the study win even where the formula would not', () => {
    const weak = Object.keys(PACKED).find(id => PACKED[id].y === 'overhead_triceps_ext' &&
      scoreOf(id).score <= scoreOf('0201').score)
    expect(weak, 'an overhead variant that scores at or under the pushdown').toBeTruthy()
    expect(compare(weak, '0201')).toMatchObject({ win: 'a', studied: true })
  })

  it('calls scores under 8 apart about the same — and 8 apart a result', () => {
    // barbell bench 48, lever chest press 53, cable fly 56 (rounded, as shown)
    const same = compare('0025', '0577')
    expect(same.win).toBeNull()
    expect(same.why).toBeNull()
    expect(same.studied).toBe(false)
    const fly = compare('0025', '0227')
    expect(roundScore(fly.b.score) - roundScore(fly.a.score)).toBe(8)
    expect(fly.win).toBe('b')
  })

  it('names the one rating whose swap lowers the winner most', () => {
    const c = compare('0025', '0227')           // fly beats bench
    // giving the fly the bench's number for one rating: which swap costs it the most points?
    const cost = k => scoresOf(c.b).score - scoresOf({ ...c.b, [k]: c.a[k] }).score
    const best = ['S', 'L', 'St', 'P', 'T', 'C'].reduce((x, k) => (cost(k) > cost(x) ? k : x))
    expect(c.why.k).toBe(best)
    expect(c.why).toMatchObject({ win: 'b', from: c.b[best], to: c.a[best] })
    expect(c.why.drop).toBeGreaterThan(0)
  })

  it('applies each side its own comfort, and a sore joint overrules the study', () => {
    const c = compare('0194', '0201', { '0194': 2 })
    expect(c.a.sore).toBe(true)
    expect(c.b.sore).toBe(false)
    expect(c.studied).toBe(false)              // 66.6 × 0.8 = 53.3 vs 53: a study doesn't outrank pain
    expect(c.win).toBeNull()
    expect(compare('0194', '0201', { '0201': 2 })).toMatchObject({ win: 'a', studied: false })
  })

  it('compares for the muscle asked, and refuses where one side isn’t rated for it', () => {
    expect(compare('1326', '0139', {}, 'biceps').muscle).toBe('biceps')
    expect(compare('1326', '0139').muscle).toBe('lats')
    expect(compare('0194', '0201', {}, 'biceps')).toBeNull()
  })

  it('has nothing to say about an unrated exercise', () => {
    expect(compare('0194', '1512')).toBeNull()
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
