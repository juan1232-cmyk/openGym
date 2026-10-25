// How a finished workout felt, in one word — what the done screen shows in place of numbers.
// Pure: no React, no storage. The orb, the badge and the line Peek says all follow from it.
//
// Deliberately only three outcomes. The screen's job is to be readable at a glance and to leave
// the person feeling they got something done, so even the lowest one is a check mark, not a
// failure: a lighter day still counts as showing up.

export const EARLY_RATIO = 0.7   // below this share of planned sets checked, the session was cut short

export const FEELS = ['record', 'good', 'light']

/**
 * `sv` is the workout's sessionVerdict (lib/verdict.js) against the last time; `done`/`total`
 * are the sets checked off and the sets planned when Finish was pressed.
 * Cutting the session short comes first: a full celebration over half a workout would undercut
 * the card that just asked you to stay. The record isn't lost — its exercise still gets the
 * star on the list — it just doesn't get the whole screen.
 */
export function finishFeel({ sv, done = 0, total = 0 }) {
  if (total > 0 && done / total < EARLY_RATIO) return 'light'
  if (sv === 'record') return 'record'
  if (!done) return 'light'
  return sv === 'less' ? 'light' : 'good'
}

const cmp = (a, b) => (a > b ? 'up' : a < b ? 'down' : 'same')
const sum = (sets, k) => sets.reduce((n, s) => n + (s[k] || 0), 0)
const topW = sets => sets.reduce((m, s) => Math.max(m, s.w || 0), 0)
const vol = sets => sets.reduce((n, s) => n + (s.w || 0) * (s.r || 0), 0)

/**
 * One exercise's verdict for the done screen, against the last time it was logged:
 * 'best' | 'up' | 'same' | 'down' | 'new' | 'partial' | 'skipped'.
 * `sets` are the sets checked off, `prevSets` the ones from last time (null if never done),
 * `planned` how many sets the session had for it, `best` whether it set a record.
 *
 * Heavier top set is "up" whatever the reps; the same weight is judged on total reps; a lighter
 * top set that still moved as much volume counts as the same rather than a step back. A lift
 * that would otherwise read "same/down/new" but had sets left unchecked is "partial" — the
 * unchecked sets are the more useful thing to say about it.
 */
export function liftVerdict({ sets = [], prevSets = null, planned = sets.length, best = false }) {
  if (!sets.length) return 'skipped'
  if (best) return 'best'
  let v
  if (!prevSets || !prevSets.length) v = 'new'
  else if (sets.some(s => s.sec != null) || prevSets.some(s => s.sec != null)) v = cmp(sum(sets, 'sec'), sum(prevSets, 'sec'))
  else if (sets.some(s => s.min != null) || prevSets.some(s => s.min != null)) v = cmp(sum(sets, 'min'), sum(prevSets, 'min'))
  else {
    const tw = topW(sets), pw = topW(prevSets)
    if (tw !== pw) v = tw > pw ? 'up' : vol(sets) >= vol(prevSets) * 0.98 ? 'same' : 'down'
    else v = cmp(sum(sets, 'r'), sum(prevSets, 'r'))
  }
  return sets.length < planned && v !== 'up' ? 'partial' : v
}

/**
 * What the progression engine will ask of a lift next time, in a few words — 'up' | 'hold' |
 * 'deload' | 'first', or null where it has nothing to say (progression switched off). `p` is a
 * nextPrescription() result. The numbers it carries are left out on purpose: the done screen
 * says which way to push, the next session's prescription says how far.
 */
export function nextAsk(p) {
  if (!p) return null
  if (p.kind === 'up') return { k: 'up', what: p.sets ? 'Add a set' : p.sec ? 'Hold it longer' : p.weight > 0 ? 'Add weight' : 'Add reps' }
  if (p.kind === 'hold') return { k: 'hold', what: 'Same again' }
  if (p.kind === 'deload') return { k: 'deload', what: 'Ease off a little' }
  if (p.kind === 'first') return { k: 'first', what: 'Set the baseline' }
  return null
}

// One sentence for under the headline, from how the exercises went. English keys for t().
export function liftSummary(verdicts) {
  const n = verdicts.length
  if (!n) return ''
  const fwd = verdicts.filter(v => v === 'best' || v === 'up' || v === 'new').length
  const open = verdicts.filter(v => v === 'partial' || v === 'skipped').length
  if (fwd === n) return 'Every lift moved forward.'
  if (open * 2 > n) return 'Some lifts got left unfinished.'
  if (fwd * 2 >= n) return 'Most lifts moved forward.'
  if (fwd) return 'Some lifts moved forward.'
  return verdicts.includes('down') ? 'A lighter day, and that’s okay.' : 'You held your ground.'
}

// What Peek says. No digits on purpose (the screen is meant to be number-free), and more than one
// per feel so a regular doesn't hear the same sentence every session. Plain English keys: t()
// falls back to them for any language that hasn't translated these.
export const LINES = {
  record: [
    'A new best. You just beat your old self.',
    'Stronger than ever. That one goes on the wall.',
    'Look at you go. That was a record.'
  ],
  good: [
    'Good workout. You earned that.',
    'Done, and done well. Another one in the bank.',
    'That’s how it’s done. See you next time.'
  ],
  light: [
    'A lighter one, and that’s okay. You still came.',
    'Not every day is a big one. Tomorrow’s yours.',
    'It counts. Showing up is the hard part.'
  ]
}

// The card that asks before finishing. Peek is glad when everything is done and visibly let down
// when you're leaving sets on the table — a nudge to stay, not a scolding: it is still your call
// and the button is right there.
export function promptKind({ done = 0, total = 0 }) {
  if (total > 0 && done >= total) return 'complete'
  if (!done) return 'none'
  return done / total >= EARLY_RATIO ? 'close' : 'early'
}
export const PROMPT = {
  complete: { head: 'That’s the whole workout!', line: 'Every single set. That’s what finishing looks like.' },
  close: { head: 'Leaving already?', line: 'So close. The last sets are the ones that make it count.' },
  early: { head: 'Leaving already?', line: 'You came all this way. Don’t leave the best part undone.' },
  none: { head: 'Not even one set?', line: 'Start with just one. I’ll be right here.' }
}
export const PROMPT_LEAVE = 'Okay… I’ll be here when you’re ready.'

// The same workout always hears the same line (reopening or re-rendering never reshuffles it),
// but different workouts spread across the list.
export function pickLine(feel, seed = '') {
  const pool = LINES[feel] || LINES.good
  let h = 0
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return pool[h % pool.length]
}
