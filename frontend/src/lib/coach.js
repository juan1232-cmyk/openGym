// The coach behind the Peek orb: reads the profile's own training and decides how the orb
// feels about it and what, if anything, it says. Pure — no React, no storage, no network.
//
// Deliberately not a lookup table. Several signals blend into one hidden score, the score
// gets noise, the mood is a weighted pick from a band (now and then the neighbouring band),
// and some turns it says nothing at all. The one rule a user can rely on: a PR gets
// celebrated. Everything else should read as a mood, not as a trigger they can map.
//
// All the randomness comes from one seeded generator (see coachSeed), so the orb holds its
// mood across re-renders and visits within a few hours, and shifts when the day moves on or
// something new is logged — without it being obvious which of those did it.
import { isoOf } from './format.js'
import { effectiveRoutineId, modeOf } from './history.js'
import { sessionsFor, stallCount } from './progression.js'
import { t } from './i18n.js'

const DAY = 864e5
const dayNum = iso => Math.round(new Date(iso + 'T12:00:00').getTime() / DAY)

/** What the coach knows. `nameOf` turns an exercise id into a display name. */
export function coachSignals(state, now = new Date(), nameOf = id => id) {
  const S = { week: {}, dayPlan: {}, routines: [], workouts: [], ...state }
  const ws = S.workouts
  const today = dayNum(isoOf(now))
  const ago = w => today - dayNum(w.d)
  const recent = (a, b) => ws.filter(w => ago(w) >= a && ago(w) < b)
  const first = ws.length ? Math.min(...ws.map(w => dayNum(w.d))) : today

  const daysOff = ws.length ? Math.min(...ws.map(ago).filter(n => n >= 0)) : null

  // planned days of the last week that came and went with nothing logged — only since the
  // first workout, so a plan made yesterday doesn't count a week of "misses" against anyone
  const done = new Set(ws.map(w => w.d))
  let planned = 0, missed = 0
  for (let i = 1; i <= 7; i++) {
    const d = new Date(now); d.setDate(d.getDate() - i)
    const iso = isoOf(d)
    if (dayNum(iso) < first || !effectiveRoutineId(S, iso)) continue
    planned++
    if (!done.has(iso)) missed++
  }

  const vol = (a, b) => recent(a, b).reduce((n, w) => n + (w.vol || 0), 0)
  const before = vol(14, 28)

  const prWs = recent(0, 14).filter(w => w.prs && w.prs.length).sort((a, b) => dayNum(b.d) - dayNum(a.d))
  const fresh = prWs.find(w => ago(w) <= 2)

  // lifts in the plan that missed their target two sessions running and are still trained
  const seen = new Set(), stalled = []
  S.routines.forEach(r => (r.ex || []).forEach(e => {
    if (seen.has(e.id) || modeOf(e) === 'cardio' || !(e.reps || e.sec)) return
    seen.add(e.id)
    const ss = sessionsFor(S, e.id, e)
    if (ss.length && today - dayNum(ss[ss.length - 1].d) < 21 && stallCount(ss) >= 2) stalled.push(nameOf(e.id))
  }))

  const todayId = effectiveRoutineId(S, isoOf(now))
  const todayRoutine = todayId ? S.routines.find(r => r.id === todayId) : null

  return {
    total: ws.length,
    daysOff,
    trainedToday: daysOff === 0,
    planned, missed,
    week: recent(0, 7).length,
    active4: new Set(recent(0, 28).map(w => Math.floor(ago(w) / 7))).size,
    volTrend: before > 0 ? vol(0, 14) / before : null,
    prs: prWs.reduce((n, w) => n + w.prs.length, 0),
    freshPR: fresh ? nameOf(fresh.prs[fresh.prs.length - 1]) : null,
    stalled,
    today: todayRoutine ? todayRoutine.name : null,
    hour: now.getHours()
  }
}

/** -1..1: how proud of you it is. Effort and progress push it up; gaps, skips and stalls down. */
export function coachScore(s) {
  if (!s.total) return 0
  let x = s.daysOff <= 1 ? 0.25 : s.daysOff <= 3 ? 0.05 : s.daysOff <= 6 ? -0.25 : s.daysOff <= 13 ? -0.55 : -0.85
  x -= Math.min(3, s.missed) * 0.15
  x += (s.active4 - 2) * 0.1
  x += Math.min(3, s.prs) * 0.1
  if (s.freshPR) x += 0.3
  if (s.volTrend != null) x += s.volTrend > 1.1 ? 0.15 : s.volTrend < 0.7 ? -0.15 : 0
  x -= Math.min(3, s.stalled.length) * 0.08
  return Math.max(-1, Math.min(1, x))
}

// mulberry32 over a string hash — small, and the same key always gives the same sequence
export function seeded(key) {
  let h = 1779033703
  for (let i = 0; i < key.length; i++) { h = Math.imul(h ^ key.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19) }
  return () => {
    h = (h + 0x6d2b79f5) | 0
    let v = Math.imul(h ^ (h >>> 15), 1 | h)
    v = (v + Math.imul(v ^ (v >>> 7), 61 | v)) ^ v
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296
  }
}
// the day, which four-hour block of it, and how much has been logged
export const coachSeed = (S, now) => isoOf(now) + '|' + Math.floor(now.getHours() / 4) + '|' + ((S.workouts || []).length)

const pickW = (rng, table) => {
  const e = Object.entries(table)
  let r = rng() * e.reduce((n, [, w]) => n + w, 0)
  for (const [k, w] of e) if ((r -= w) < 0) return k
  return e[e.length - 1][0]
}
const BANDS = {
  high: { happy: 3, proud: 2, playful: 2, celebrate: 1, excited: 1 },
  mid: { idle: 4, curious: 2, suspicious: 1, playful: 1 },
  low: { angry: 3, suspicious: 2, disappointed: 2, bored: 1 }
}
export const BAND_OF = { drowsy: 'late' }
Object.entries(BANDS).forEach(([b, tb]) => Object.keys(tb).forEach(m => { BAND_OF[m] = BAND_OF[m] || b }))

/** One of orb-rig MOODS. */
export function coachMood(score, s, rng) {
  if (s.freshPR) return pickW(rng, { celebrate: 3, proud: 2, excited: 2 })
  if ((s.hour >= 23 || s.hour < 5) && rng() < 0.35) return 'drowsy'
  if (!s.total) return pickW(rng, { curious: 3, idle: 2, playful: 1 })
  const nudge = (rng() - 0.5) * 0.3
  let band = score + nudge > 0.35 ? 'high' : score + nudge < -0.25 ? 'low' : 'mid'
  // now and then it's in a mood of its own: grumpy on a good week, soft on a bad one
  if (rng() < 0.08) band = band === 'mid' ? (rng() < 0.5 ? 'high' : 'low') : 'mid'
  return pickW(rng, band === 'low' && score < -0.6 ? { ...BANDS.low, angry: 6 } : BANDS[band])
}

// Lines are [template, ...args] until the end, so a template is only ever filled by t().
const LINES = {
  pr: s => [
    ['{0} PR. I saw that.', s.freshPR],
    ['That {0} PR? Proud of you.', s.freshPR],
    ['{0} went up. Keep that energy.', s.freshPR],
    ...(s.prs > 1 ? [['{0} PRs in two weeks. Who are you?', s.prs], ['New {0} PR. Again.', s.freshPR]] : [])
  ],
  late: () => [["It's late. Sleep is part of training."], ['Go to bed. Gains happen there.']],
  new: () => [["Hey. I'm Peek. Log a workout and we'll talk."], ["Nothing logged yet. Show me what you've got."]],
  high: s => [
    ...(s.trainedToday ? [['Good session. That one counted.'], ['Done. Now go eat.']] : []),
    ...(s.week >= 2 ? [["{0} sessions this week. That's how it's done.", s.week]] : []),
    ...(s.volTrend > 1.1 ? [['Volume is up. I like where this is going.']] : []),
    ...(s.active4 >= 4 ? [["Four weeks without a gap. Don't get comfy."]] : [])
  ],
  highAny: () => [["You're actually doing it. Keep going."], ['Solid. Now do it again.']],
  mid: s => [
    ...(s.today && !s.trainedToday ? [['{0} today. You know what to do.', s.today], ['{0} is waiting.', s.today]] : []),
    ...(s.trainedToday ? [['Done for today. Eat something with protein in it.'], ["Rest counts too. Don't skip it."]] : []),
    ...(s.stalled.length ? [['{0} has been stubborn lately.', s.stalled[0]]] : [])
  ],
  midAny: () => [["I'm watching. Casually."], ['Still here.'], ['Good day to lift something heavy.']],
  low: s => [
    ...(s.daysOff >= 3 ? [['{0} days. The bar misses you. Not really.', s.daysOff], ['{0} days without training. Get up.', s.daysOff], ["It's been {0} days. I've been counting.", s.daysOff]] : []),
    ...(s.missed === 1 ? [["You skipped a planned day. Don't make it two."]] : []),
    ...(s.missed > 1 ? [['You planned {0} sessions this week. You did {1}.', s.planned, s.planned - s.missed], ['{0} planned days skipped. Fix it today.', s.missed]] : []),
    ...(s.stalled.length ? [['{0} is stuck. Something has to change.', s.stalled[0]]] : [])
  ],
  lowAny: () => [["I'm not mad. I'm disappointed. Also mad."], ['No excuses today.'], ['Less scrolling. More lifting.']]
}
const say = ([tpl, ...args]) => { const v = t(tpl, ...args); return v.charAt(0).toUpperCase() + v.slice(1) }
const one = (rng, arr) => arr[Math.floor(rng() * arr.length)]

/** What it says in this mood, or null — silence is part of it. */
export function coachLine(mood, s, rng) {
  if (s.freshPR) return say(one(rng, LINES.pr(s)))
  if (mood === 'drowsy') return rng() < 0.6 ? say(one(rng, LINES.late())) : null
  if (!s.total) return say(one(rng, LINES.new()))
  const band = BAND_OF[mood] || 'mid'
  if (rng() < (band === 'mid' ? 0.2 : 0.08)) return null
  // the specific lines win most of the time; the stock ones keep it from sounding like a report
  const specific = LINES[band](s)
  return say(one(rng, specific.length && rng() < 0.75 ? specific : LINES[band + 'Any']()))
}

/** A burst of taps: `n` taps in the last few seconds. null = just a squish. */
export function pokeReaction(n, rng) {
  if (n >= 6) return { mood: 'angry', line: say(one(rng, [['Stop poking me. Go lift.'], ['Poke me again. I dare you.'], ["That's it. I'm mad now."]])) }
  if (n >= 3) return { mood: 'suspicious', line: rng() < 0.7 ? say(one(rng, [['What.'], ['Yes?'], ["I'm right here."], ['Can I help you?']])) : null }
  return null
}

/** Everything Home needs in one call. */
export function coach(S, now = new Date(), nameOf) {
  const signals = coachSignals(S, now, nameOf)
  const score = coachScore(signals)
  const rng = seeded(coachSeed(S, now))
  const mood = coachMood(score, signals, rng)
  return { signals, score, mood, line: coachLine(mood, signals, rng) }
}
