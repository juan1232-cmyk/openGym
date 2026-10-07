// The coach behind the Peek orb: reads the profile's own training and decides how the orb
// feels about it and what it says. Pure — no React, no storage, no network.
//
// What it thinks is not random: lib/verdict.js decides — the same log, the same verdict —
// whether you're progressing, holding, slipping, stalled or away, and the mood always comes
// from that verdict's own set of faces. The randomness is only in *which* face and *which*
// line, so it doesn't sound like a report, never in what it's telling you. (It used to blur
// the verdict on purpose — noise on a score, now and then the neighbouring mood — which is
// exactly why it read as decoration rather than as something to check.)
//
// All the randomness comes from one seeded generator (see coachSeed), so the orb holds its
// face and line across re-renders and visits within a few hours.
import { isoOf } from './format.js'
import { effectiveRoutineId } from './history.js'
import { progressVerdict } from './verdict.js'
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

  const prWs = recent(0, 14).filter(w => w.prs && w.prs.length).sort((a, b) => dayNum(b.d) - dayNum(a.d))
  const fresh = prWs.find(w => ago(w) <= 2)

  const verdict = progressVerdict(S, now, nameOf)

  const todayId = effectiveRoutineId(S, isoOf(now))
  const todayRoutine = todayId ? S.routines.find(r => r.id === todayId) : null

  return {
    total: ws.length,
    daysOff,
    trainedToday: daysOff === 0,
    planned, missed,
    prs: prWs.reduce((n, w) => n + w.prs.length, 0),
    freshPR: fresh ? nameOf(fresh.prs[fresh.prs.length - 1]) : null,
    verdict,
    today: todayRoutine ? todayRoutine.name : null,
    hour: now.getHours()
  }
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
// Each verdict's own faces. Which one is random; which table it comes from never is.
export const VERDICT_MOODS = {
  progressing: { happy: 3, proud: 3, playful: 2, excited: 1 },
  holding: { idle: 4, curious: 2, playful: 1 },
  slipping: { disappointed: 3, suspicious: 2, angry: 1 },
  stalled: { suspicious: 3, disappointed: 2, bored: 1 },
  away: { angry: 3, disappointed: 2, bored: 1 },
  new: { curious: 3, idle: 2, playful: 1 }
}

/** One of orb-rig MOODS. */
export function coachMood(s, rng) {
  const v = s.verdict.state
  if (s.freshPR) return pickW(rng, { celebrate: 3, proud: 2, excited: 2 })
  // sleepy late at night — but only when that isn't covering up bad news
  if ((s.hour >= 23 || s.hour < 5) && (v === 'progressing' || v === 'holding') && rng() < 0.35) return 'drowsy'
  return pickW(rng, VERDICT_MOODS[v])
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
  new: s => s.total
    ? [["A couple more sessions and I'll tell you how you're doing."], ["Keep logging. I'm still figuring you out."]]
    : [["Hey. I'm Peek. Log a workout and we'll talk."], ["Nothing logged yet. Show me what you've got."]],
  progressing: s => [
    ...(s.verdict.up.length >= 3 ? [['{0} lifts going up. This is working.', s.verdict.up.length]] : []),
    ...(s.verdict.up.length === 2 ? [['{0} and {1} are both going up.', s.verdict.up[0], s.verdict.up[1]]] : []),
    ...(s.verdict.up.length === 1 ? [['{0} keeps climbing. I see it.', s.verdict.up[0]], ['{0} is going up. Keep pushing.', s.verdict.up[0]]] : []),
    ...(!s.verdict.up.length && s.prs ? [['{0} PRs in two weeks. Keep them coming.', s.prs]] : []),
    // naming what went up is the point; the skipped-days nag is only for when there's nothing to name
    ...(!s.verdict.up.length && s.missed ? [["You're getting stronger. Now stop skipping days."]] : [])
  ],
  progressingAny: () => [["You're getting stronger. Keep going."], ['Stronger than last month. Do it again.']],
  holding: s => [
    ...(s.today && !s.trainedToday ? [['{0} today. You know what to do.', s.today], ['{0} is waiting.', s.today]] : []),
    ...(s.trainedToday ? [['Done for today. Eat something with protein in it.']] : []),
    ...(s.verdict.flat.length ? [['{0} is holding steady. Time to push it.', s.verdict.flat[0]]] : []),
    ...(s.missed ? [["You skipped a planned day. Don't make it two."]] : [])
  ],
  holdingAny: () => [['Holding steady. Not worse, not better.'], ["I'm watching. Casually."], ['Good day to lift something heavy.']],
  slipping: s => [
    ...(s.verdict.down.length >= 2 ? [['{0} and {1} are both going down.', s.verdict.down[0], s.verdict.down[1]]] : []),
    ...(s.verdict.down.length === 1 ? [['{0} is going backwards.', s.verdict.down[0]], ['{0} is dropping. Sleep, eat, then push.', s.verdict.down[0]]] : []),
    ...(!s.verdict.down.length && s.missed > 1 ? [['You planned {0} sessions this week. You did {1}.', s.planned, s.planned - s.missed]] : [])
  ],
  slippingAny: () => [["You're slipping. Let's fix it today."]],
  stalled: s => [
    ['{0} and {1} are stuck.', s.verdict.stalled[0], s.verdict.stalled[1]],
    ["{0} hasn't moved in a while. Something has to change.", s.verdict.stalled[0]]
  ],
  stalledAny: () => [['Stuck. Change something: reps, rest or sleep.']],
  away: s => [
    ['{0} days. The bar misses you. Not really.', s.daysOff],
    ['{0} days without training. Get up.', s.daysOff],
    ["It's been {0} days. I've been counting.", s.daysOff]
  ],
  awayAny: () => [["I'm not mad. I'm disappointed. Also mad."], ['No excuses today.']]
}
const say = ([tpl, ...args]) => { const v = t(tpl, ...args); return v.charAt(0).toUpperCase() + v.slice(1) }
const one = (rng, arr) => arr[Math.floor(rng() * arr.length)]

/** What it says. Always something, except now and then on a plain holding day. */
export function coachLine(mood, s, rng) {
  if (s.freshPR) return say(one(rng, LINES.pr(s)))
  if (mood === 'drowsy' && rng() < 0.6) return say(one(rng, LINES.late()))
  const v = s.verdict.state
  if (v === 'new') return say(one(rng, LINES.new(s)))
  if (v === 'holding' && rng() < 0.2) return null
  // the line naming the lift is the point; the stock ones are only for when there's none
  const specific = LINES[v](s)
  return say(one(rng, specific.length ? specific : LINES[v + 'Any']()))
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
  const rng = seeded(coachSeed(S, now))
  const mood = coachMood(signals, rng)
  return { signals, verdict: signals.verdict.state, mood, line: coachLine(mood, signals, rng) }
}
