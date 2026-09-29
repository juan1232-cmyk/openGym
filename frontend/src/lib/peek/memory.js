// Peek's memory: the part of the character that lasts between visits and grows with you.
// Pure functions over `S.peek` (see PEEK_DEF) — the store writes the result through update(),
// so it syncs across devices like the rest of the profile. Most of what Peek "remembers" is
// derived from S.workouts on the fly (PRs, gaps, skipped days); only what can't be derived is
// stored: the bond, the moments list, yesterday's mood, what it said recently, and the
// user's settings for it.
import { isoOf, DAYN } from '../format.js'
import { effectiveRoutineId } from '../history.js'
import { t } from '../i18n.js'
import { pickLine } from './lines.js'

export const PEEK_DEF = {
  bond: 0,            // 0–100, see STAGES
  seen: null,         // last day Home was opened (ISO)
  greeted: null,      // the last-workout date whose absence already got its reunion
  carry: 0,           // yesterday's mood score, leaking into today's (-1..1)
  lastScore: 0, carryDay: null,
  said: [],           // recent line templates, so it doesn't repeat itself
  moments: [],        // [{ k, d, x? }] — things only it would remember, newest last
  voice: true,        // lines on/off (faces always stay)
  push: true,         // notifications in its voice, and the absence nudges
  honesty: 'normal'   // 'gentle' | 'normal' | 'brutal'
}
export const peekOf = S => ({ ...PEEK_DEF, ...((S && S.peek) || {}) })

// Where each stage starts. At ~4 bond a session: acquaintance after the first week or so,
// training partner after a month of showing up, ride or die after about two.
export const STAGES = [0, 15, 45, 80]
export const STAGE_NAME = ['Stranger', 'Gym acquaintance', 'Training partner', 'Ride or die']
export const stageOf = bond => STAGES.reduce((s, min, i) => ((bond || 0) >= min ? i : s), 0)

const DAY = 864e5
const dayNum = iso => Math.round(new Date(iso + 'T12:00:00').getTime() / DAY)
const lastDate = S => ((S.workouts || []).length ? S.workouts.map(w => w.d).sort().pop() : null)
const MAX_MOMENTS = 30
const MAX_SAID = 12

/** Add a moment. The first session is never forgotten; everything else rolls off. */
export function remember(peek, k, d, x) {
  const m = [...(peek.moments || []), x === undefined ? { k, d } : { k, d, x }]
  while (m.length > MAX_MOMENTS) {
    const i = m.findIndex(e => e.k !== 'first')
    m.splice(i < 0 ? 0 : i, 1)
  }
  return { ...peek, moments: m }
}

export const noteSaid = (peek, key) => (key ? { ...peek, said: [...(peek.said || []).filter(k => k !== key), key].slice(-MAX_SAID) } : peek)

/**
 * Opening Home. Returns { peek, changed, reunion, daysOff }:
 * - the bond fades by half a point a day once you've been gone more than a week
 * - a 5+ day absence gets one reunion, the first time you open the app during it
 * - once a day, yesterday's score rolls into `carry`
 * `score` is today's coach score (coach.js), kept so tomorrow can carry it.
 */
export function visit(peek, S, now, score = 0) {
  const today = isoOf(now), tn = dayNum(today)
  const last = lastDate(S)
  const daysOff = last ? tn - dayNum(last) : null
  let p = { ...peek }, reunion = false

  if (last && daysOff > 7) {
    const before = p.seen ? Math.max(0, dayNum(p.seen) - dayNum(last)) : 0
    const fade = Math.max(0, daysOff - Math.max(7, before))
    if (fade) p.bond = Math.max(0, Math.round((p.bond - fade * 0.5) * 10) / 10)
  }
  if (last && daysOff >= 5 && p.greeted !== last) { reunion = true; p.greeted = last }
  if (p.carryDay !== today) {
    if (p.carryDay) p.carry = Math.round(((p.carry || 0) * 0.5 + (p.lastScore || 0) * 0.5) * 100) / 100
    p.carryDay = today
  }
  p.lastScore = Math.round(score * 100) / 100
  p.seen = today
  const changed = ['bond', 'greeted', 'carry', 'carryDay', 'lastScore', 'seen'].some(k => p[k] !== peek[k])
  return { peek: p, changed, reunion, daysOff }
}

/**
 * A finished workout, before it's added to S.workouts. Returns { peek, events }, events being
 * what the finish journey may want to say something about:
 *   { k: 'first' } { k: 'comeback', days } { k: 'milestone', n } { k: 'stageUp', stage }
 */
export function afterWorkout(peek, S, w, { early = false } = {}) {
  const ws = S.workouts || []
  const events = []
  let p = { ...peek }
  const last = lastDate(S)
  const gap = last ? dayNum(w.d) - dayNum(last) : null
  const n = ws.length + 1

  if (!ws.length) { events.push({ k: 'first' }); p = remember(p, 'first', w.d) }
  if (gap >= 7) { events.push({ k: 'comeback', days: gap }); p = remember(p, 'comeback', w.d, gap) }
  if ([10, 25, 50, 100, 150, 200, 300, 500].includes(n)) { events.push({ k: 'milestone', n }); p = remember(p, 'milestone', w.d, n) }
  ;(w.prs || []).forEach(id => { p = remember(p, 'pr', w.d, id) })
  if (early) p = remember(p, 'early', w.d)

  const onPlan = w.routineId && effectiveRoutineId({ dayPlan: {}, week: {}, routines: [], ...S }, w.d) === w.routineId
  const gain = early ? 0.5 : 2 + (onPlan ? 1 : 0) + ((w.prs || []).length ? 2 : 0) + (gap >= 7 ? 2 : 0)
  const before = stageOf(p.bond)
  p.bond = Math.min(100, Math.round(((p.bond || 0) + gain) * 10) / 10)
  const after = stageOf(p.bond)
  if (after > before) events.push({ k: 'stageUp', stage: after })
  return { peek: p, events }
}

/** Tapping it to anger — it remembers for a few days. */
export const rememberPoked = (peek, now) => {
  const d = isoOf(now)
  return (peek.moments || []).some(m => m.k === 'poked' && m.d === d) ? peek : remember(peek, 'poked', d)
}

/**
 * Something from its memory that is true right now, as a line — or null. Each candidate
 * only exists when the history backs it up; the line itself still has to fit the bond stage
 * (lines.js), which is what keeps a stranger from bringing up the past.
 */
export function callbackLine(peek, S, now, rng = Math.random, { stage = 0, honesty = 'normal' } = {}) {
  const today = isoOf(now), tn = dayNum(today)
  const ms = peek.moments || []
  const ws = S.workouts || []
  const cands = []

  const last = lastDate(S)
  if (last && ms.some(m => m.k === 'early' && m.d === last)) cands.push(['cbEarly'])
  const month = today.slice(0, 7)
  const prsMonth = ms.filter(m => m.k === 'pr' && m.d.slice(0, 7) === month).length
  if (prsMonth >= 3) cands.push(['cbPRs', prsMonth])
  const first = ms.find(m => m.k === 'first')
  if (first && tn - dayNum(first.d) >= 30) cands.push(['cbSince', tn - dayNum(first.d)])
  if (ms.some(m => m.k === 'poked' && tn - dayNum(m.d) <= 3)) cands.push(['cbPoked'])
  if (stage >= 3 && rng() < 0.3) cands.push(['cbRare'])

  // a planned weekday that came and went twice in a row with nothing logged
  if (ws.length) {
    const done = new Set(ws.map(w => w.d)), firstD = Math.min(...ws.map(w => dayNum(w.d)))
    const S2 = { dayPlan: {}, week: {}, routines: [], ...S }
    for (let back = 1; back <= 7; back++) {
      const a = new Date(now); a.setDate(a.getDate() - back)
      const b = new Date(a); b.setDate(b.getDate() - 7)
      const ia = isoOf(a), ib = isoOf(b)
      if (dayNum(ib) < firstD) continue
      if (effectiveRoutineId(S2, ia) && effectiveRoutineId(S2, ib) && !done.has(ia) && !done.has(ib)) {
        cands.push(['cbSkipDay', t(DAYN[a.getDay()])])
        break
      }
    }
  }
  while (cands.length) {
    const [sit, ...args] = cands.splice(Math.floor(rng() * cands.length), 1)[0]
    const l = pickLine(sit, args, rng, { stage, honesty, said: peek.said })
    if (l) return l
  }
  return null
}
