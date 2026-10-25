import { describe, it, expect } from 'vitest'
import { finishFeel, pickLine, liftVerdict, liftSummary, nextAsk, promptKind, PROMPT, LINES, FEELS, EARLY_RATIO } from './finishfeel.js'

describe('finishFeel', () => {
  it('a record on a full session is a record', () => {
    expect(finishFeel({ sv: 'record', done: 9, total: 9 })).toBe('record')
    expect(finishFeel({ sv: 'record', done: 8, total: 9 })).toBe('record')
  })
  it('a record on a session cut well short does not get the full celebration', () => {
    expect(finishFeel({ sv: 'record', done: 2, total: 20 })).toBe('light')
  })
  it('a full session at or above last time is good', () => {
    for (const sv of ['more', 'same', 'first']) expect(finishFeel({ sv, done: 10, total: 10 })).toBe('good')
  })
  it('a lighter session than last time reads as light', () => {
    expect(finishFeel({ sv: 'less', done: 10, total: 10 })).toBe('light')
  })
  it('cutting the session short reads as light, whatever the volume', () => {
    expect(finishFeel({ sv: 'more', done: 6, total: 10 })).toBe('light')
  })
  it('stopping exactly at the early threshold still counts as good', () => {
    const total = 10, done = total * EARLY_RATIO
    expect(finishFeel({ sv: 'same', done, total })).toBe('good')
  })
  it('finishing with nothing logged is light, not good', () => {
    expect(finishFeel({ sv: 'first', done: 0, total: 0 })).toBe('light')
    expect(finishFeel({ sv: 'first', done: 0, total: 8 })).toBe('light')
  })
  it('extra sets beyond the plan are not penalised', () => {
    expect(finishFeel({ sv: 'same', done: 12, total: 10 })).toBe('good')
  })
})

const S = (w, r) => ({ w, r, done: true })

describe('liftVerdict', () => {
  it('a record is best', () => {
    expect(liftVerdict({ sets: [S(100, 5)], prevSets: [S(90, 5)], best: true })).toBe('best')
  })
  it('a heavier top set is up whatever the reps', () => {
    expect(liftVerdict({ sets: [S(82.5, 3)], prevSets: [S(80, 8)] })).toBe('up')
  })
  it('the same weight is judged on total reps', () => {
    expect(liftVerdict({ sets: [S(80, 5), S(80, 6)], prevSets: [S(80, 5), S(80, 5)] })).toBe('up')
    expect(liftVerdict({ sets: [S(80, 5), S(80, 5)], prevSets: [S(80, 5), S(80, 5)] })).toBe('same')
    expect(liftVerdict({ sets: [S(80, 4), S(80, 4)], prevSets: [S(80, 5), S(80, 5)] })).toBe('down')
  })
  it('a lighter top set that moved as much volume is the same, not a step back', () => {
    expect(liftVerdict({ sets: [S(70, 10)], prevSets: [S(80, 8)] })).toBe('same')
    expect(liftVerdict({ sets: [S(60, 5)], prevSets: [S(80, 8)] })).toBe('down')
  })
  it('bodyweight lifts compare reps', () => {
    expect(liftVerdict({ sets: [S(0, 12)], prevSets: [S(null, 10)] })).toBe('up')
  })
  it('timed and cardio sets compare time', () => {
    expect(liftVerdict({ sets: [{ sec: 50, done: true }], prevSets: [{ sec: 45, done: true }] })).toBe('up')
    expect(liftVerdict({ sets: [{ min: 20, done: true }], prevSets: [{ min: 25, done: true }] })).toBe('down')
  })
  it('a first time is new', () => {
    expect(liftVerdict({ sets: [S(40, 8)], prevSets: null })).toBe('new')
  })
  it('nothing checked off is skipped', () => {
    expect(liftVerdict({ sets: [], prevSets: [S(80, 5)], planned: 3 })).toBe('skipped')
  })
  it('unchecked sets turn a same/down/new into partial, but never hide an up', () => {
    expect(liftVerdict({ sets: [S(80, 5)], prevSets: [S(80, 5)], planned: 3 })).toBe('partial')
    expect(liftVerdict({ sets: [S(80, 5)], prevSets: null, planned: 3 })).toBe('partial')
    expect(liftVerdict({ sets: [S(85, 5)], prevSets: [S(80, 5)], planned: 3 })).toBe('up')
  })
})

describe('nextAsk', () => {
  it('names the direction in words, not numbers', () => {
    expect(nextAsk({ kind: 'up', weight: 82.5, reps: 5 })).toEqual({ k: 'up', what: 'Add weight' })
    expect(nextAsk({ kind: 'up', weight: 0, reps: 11 })).toEqual({ k: 'up', what: 'Add reps' })
    expect(nextAsk({ kind: 'up', weight: 0, reps: 8, sets: 4 })).toEqual({ k: 'up', what: 'Add a set' })
    expect(nextAsk({ kind: 'up', sec: 50 })).toEqual({ k: 'up', what: 'Hold it longer' })
  })
  it('hold, deload and first', () => {
    expect(nextAsk({ kind: 'hold', weight: 80 }).what).toBe('Same again')
    expect(nextAsk({ kind: 'deload', weight: 70 }).what).toBe('Ease off a little')
    expect(nextAsk({ kind: 'first' }).what).toBe('Set the baseline')
  })
  it('says nothing when progression is off', () => {
    expect(nextAsk({ kind: 'off' })).toBeNull()
    expect(nextAsk(undefined)).toBeNull()
  })
  it('no digits in any wording', () => {
    for (const p of [{ kind: 'up', weight: 5 }, { kind: 'up' }, { kind: 'hold' }, { kind: 'deload' }, { kind: 'first' }]) {
      expect(nextAsk(p).what).not.toMatch(/\d/)
    }
  })
})

describe('liftSummary', () => {
  it('says nothing for an empty workout', () => expect(liftSummary([])).toBe(''))
  it('every lift forward', () => expect(liftSummary(['best', 'up', 'new'])).toBe('Every lift moved forward.'))
  it('most / some forward', () => {
    expect(liftSummary(['up', 'up', 'same'])).toBe('Most lifts moved forward.')
    expect(liftSummary(['up', 'same', 'same'])).toBe('Some lifts moved forward.')
  })
  it('mostly unfinished beats everything else', () => {
    expect(liftSummary(['up', 'skipped', 'partial'])).toBe('Some lifts got left unfinished.')
  })
  it('held or lighter', () => {
    expect(liftSummary(['same', 'same'])).toBe('You held your ground.')
    expect(liftSummary(['same', 'down'])).toBe('A lighter day, and that’s okay.')
  })
  it('no digits', () => {
    for (const k of ['up', 'same', 'down', 'partial']) expect(liftSummary([k])).not.toMatch(/\d/)
  })
})

describe('promptKind', () => {
  it('complete when every planned set is done', () => expect(promptKind({ done: 9, total: 9 })).toBe('complete'))
  it('none when nothing is checked', () => expect(promptKind({ done: 0, total: 9 })).toBe('none'))
  it('close vs early by how much is left', () => {
    expect(promptKind({ done: 8, total: 9 })).toBe('close')
    expect(promptKind({ done: 3, total: 9 })).toBe('early')
  })
  it('every prompt has a head and a line, no digits', () => {
    for (const k of Object.keys(PROMPT)) {
      expect(PROMPT[k].head).toBeTruthy()
      expect(PROMPT[k].line + PROMPT[k].head).not.toMatch(/\d/)
    }
  })
})

describe('Peek’s lines', () => {
  it('every feel has several lines and none contains a number', () => {
    for (const f of FEELS) {
      expect(LINES[f].length).toBeGreaterThanOrEqual(3)
      for (const l of LINES[f]) expect(l).not.toMatch(/\d/)
    }
  })
  it('the same workout always gets the same line', () => {
    expect(pickLine('good', 'abc123')).toBe(pickLine('good', 'abc123'))
  })
  it('different workouts spread across the list', () => {
    const seen = new Set()
    for (let i = 0; i < 40; i++) seen.add(pickLine('good', 'w' + i))
    expect(seen.size).toBe(LINES.good.length)
  })
  it('an unknown feel falls back rather than throwing', () => {
    expect(LINES.good).toContain(pickLine('nope', 'x'))
  })
})
