// The coach behind the Peek orb: reads the profile's own training and decides how the orb
// feels about it and what, if anything, it says. Pure — no React, no storage, no network.
//
// Deliberately not a lookup table. Several signals blend into one hidden score, the score
// gets noise, the mood is a weighted pick from a band (now and then the neighbouring band),
// and some turns it says nothing at all. The rules a user can rely on: a PR gets
// celebrated, and so do a first session, a milestone and a comeback (see coachMoment).
// Everything else should read as a mood, not as a trigger they can map.
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
  // if they trained today: how long the gap before it was — a comeback deserves a word
  const prior = ws.map(ago).filter(n => n > 0)
  const gapBefore = daysOff === 0 && prior.length ? Math.min(...prior) : null

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
    gapBefore,
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

// The other things it never lets slide: a first session, a round number of them, and
// showing up again after a long gap. Only on the day it happens, so they can't go stale.
const MILESTONES = [10, 25, 50, 100, 150, 200, 250, 300, 365, 500, 1000]
export function coachMoment(s) {
  if (!s.trainedToday) return null
  if (s.total === 1) return 'first'
  if (MILESTONES.includes(s.total)) return 'milestone'
  if (s.gapBefore >= 7) return 'comeback'
  return null
}

/** One of orb-rig MOODS. */
export function coachMood(score, s, rng) {
  if (s.freshPR) return pickW(rng, { celebrate: 3, proud: 2, excited: 2 })
  if (coachMoment(s)) return pickW(rng, { proud: 3, happy: 2, excited: 1 })
  if ((s.hour >= 23 || s.hour < 5) && rng() < 0.35) return 'drowsy'
  if (!s.total) return pickW(rng, { curious: 3, idle: 2, playful: 1 })
  const nudge = (rng() - 0.5) * 0.3
  let band = score + nudge > 0.35 ? 'high' : score + nudge < -0.25 ? 'low' : 'mid'
  // now and then it's in a mood of its own: grumpy on a good week, soft on a bad one
  if (rng() < 0.08) band = band === 'mid' ? (rng() < 0.5 ? 'high' : 'low') : 'mid'
  return pickW(rng, band === 'low' && score < -0.6 ? { ...BANDS.low, angry: 6 } : BANDS[band])
}

// Lines are [template, ...args] until the end, so a template is only ever filled by t().
// Most of them should be worth reading: a fact about their own training, or something they
// can actually do with it. The snark is the delivery, not the content.
const LINES = {
  pr: s => [
    ['{0} PR. I saw that.', s.freshPR],
    ['That {0} PR? Proud of you.', s.freshPR],
    ['{0} went up. Keep that energy.', s.freshPR],
    ['New {0} PR. Own that weight for a session or two before adding more.', s.freshPR],
    ["{0} PR. Eat well and sleep tonight. That's how it sticks.", s.freshPR],
    ...(s.prs > 1 ? [['{0} PRs in two weeks. Who are you?', s.prs], ['New {0} PR. Again.', s.freshPR]] : [])
  ],
  first: () => [
    ['First session logged. The hardest one is done.'],
    ['Day one. Light weights and clean form now, the numbers come later.'],
    ["First one in. Next time, beat it by a single rep. That's the whole game."]
  ],
  milestone: s => [
    ['{0} sessions. Most people quit long before this.', s.total],
    ['Session {0}. Go look at your first numbers. Then keep going.', s.total],
    ['{0} workouts logged. This is a habit now, not a phase.', s.total]
  ],
  comeback: s => [
    ['Back after {0} days. Go a bit lighter today and build up.', s.gapBefore],
    ["{0} days off and you came back. That's the part that matters.", s.gapBefore],
    ["Expect to be sore tomorrow. It passes, and it's less every time."],
    ...(s.gapBefore >= 14 ? [['After {0} days, take 10-20% off and earn it back over a couple of weeks.', s.gapBefore]] : [])
  ],
  late: s => [
    ["It's late. Sleep is part of training."],
    ['Go to bed. Gains happen there.'],
    ['Screens off a bit before bed. Better sleep, better lifts.'],
    ['Keep caffeine before mid-afternoon tomorrow. Late coffee steals sleep.'],
    ...(s.trainedToday ? [['You trained today. Now give it 8 hours of sleep to pay off.']] : [])
  ],
  // After midnight it goes quiet and a little cosmic, in the voice of Minecraft's End Poem
  // (lowercase, second person, "the player"). Shown as written — no capital, see coachLine.
  night: s => [
    ['and the player slept, and while they slept, the muscle was rebuilt.'],
    ['you lifted the iron today. the iron stayed the same. you did not.'],
    ['every rep was a small promise. tonight, the body keeps it.'],
    ['the dark is where the growing happens. close your eyes.'],
    ['you think strength is made in the gym. it is only asked for there.'],
    ['the world is quiet now. even the iron rests.'],
    ['sleep, and the world will save your progress.'],
    ['tomorrow is a new world. same seed. a stronger player.'],
    ['the bar was heavy once. remember that, the next time it feels heavy.'],
    ['somewhere, the you from day one is watching. they would not believe it.'],
    ['you are not the numbers on the bar. but you wrote every one of them.'],
    ['the player dreamed of heavier weights. and the dream was patient.'],
    ...(s.total > 1 ? [['{0} sessions behind you, and every one of them is still in you.', s.total]] : []),
    ...(s.trainedToday ? [['you showed up today. the universe noticed. now sleep.']] : []),
    ...(s.daysOff >= 3 ? [['the world has waited {0} days for the player. it is patient. for now.', s.daysOff]] : []),
    // and some in the spirit of Vinland Saga: strength without enemies, a field cleared by
    // coming back every morning, a land you're walking toward
    ["a true warrior doesn't need a sword. you don't need a reason. just the next session."],
    ['you have no enemies. not the bar, not the scale, not the person on the next bench.'],
    ['thorfinn cleared a forest one stump at a time. a field is just a lot of mornings.'],
    ["you can't sow and harvest on the same day. you sowed. now sleep."],
    ["the field doesn't grow faster if you shout at it. neither do you."],
    ['anger gets you to the gym once. something you love gets you there for years.'],
    ['strength used to hurt is cheap. strength used to carry is rare.'],
    ["the strongest one isn't who lifts the most. it's who comes back when no one is watching."],
    ["your vinland isn't a place. it's the you you're walking toward."],
    ['the real fight was never with the weight. it was with the version of you that stays in bed.']
  ],
  new: () => [
    ["Hey. I'm Peek. Log a workout and we'll talk."],
    ["Nothing logged yet. Show me what you've got."],
    ['Pick a plan you can repeat three times a week. Fancy can wait.']
  ],
  high: s => [
    ...(s.trainedToday ? [['Good session. That one counted.'], ['Done. Now go eat.'], ['Protein and a real meal in the next few hours. Recovery starts now.']] : []),
    ...(s.week >= 2 ? [["{0} sessions this week. That's how it's done.", s.week]] : []),
    ...(s.week >= 4 ? [['{0} this week. Make sure one day is actual rest.', s.week]] : []),
    ...(s.volTrend > 1.1 ? [['Volume is up. I like where this is going.'], ['Volume is climbing. Sleep and food have to climb with it.']] : []),
    ...(s.active4 >= 4 ? [["Four weeks without a gap. Don't get comfy."], ['A month straight. If everything starts feeling heavy, take a lighter week.']] : [])
  ],
  highAny: () => [
    ["You're actually doing it. Keep going."],
    ['Solid. Now do it again.'],
    ["A bit more weight or one more rep than last time. Every time. That's it."],
    ['Momentum is easy to keep and hard to restart. Protect it.']
  ],
  mid: s => [
    ...(s.today && !s.trainedToday ? [['{0} today. You know what to do.', s.today], ['{0} is waiting.', s.today]] : []),
    ...(s.today && !s.trainedToday && s.hour >= 18 ? [['Still time for {0}. A short version beats skipping it.', s.today]] : []),
    ...(!s.today && !s.trainedToday ? [["Rest day. Walk, eat, sleep. That's the program today."], ['Rest day. Muscle gets built now, not under the bar.']] : []),
    ...(s.trainedToday ? [['Done for today. Eat something with protein in it.'], ["Rest counts too. Don't skip it."]] : []),
    ...(s.stalled.length ? [['{0} has been stubborn lately.', s.stalled[0]], ['{0} stuck? Add reps at the same weight first, then add load.', s.stalled[0]]] : [])
  ],
  midAny: () => [
    ["I'm watching. Casually."],
    ['Still here.'],
    ['Good day to lift something heavy.'],
    ['Leave a rep or two in the tank on most sets. Save the grinders.'],
    ['Rest 2-3 minutes between heavy sets. Rushing them costs reps.'],
    ['Control the way down. That half of the rep counts too.'],
    ['A couple of light warm-up sets first. Cheaper than an injury.'],
    ['Aim for about 1.6 g of protein per kg of body weight a day.'],
    ['Creatine, 3-5 g a day. One of the few supplements that actually works.'],
    ["Soreness isn't the goal. Beating last time is."],
    ['Sleep is the cheapest performance boost there is.'],
    ['A walk on rest days helps recovery more than the couch does.'],
    ["Same weight, cleaner reps. That's progress too."],
    ["Sharp pain isn't soreness. Stop that lift, don't push through it."]
  ],
  low: s => [
    ...(s.daysOff >= 3 ? [['{0} days. The bar misses you. Not really.', s.daysOff], ['{0} days without training. Get up.', s.daysOff], ["It's been {0} days. I've been counting.", s.daysOff]] : []),
    ...(s.daysOff >= 14 ? [['{0} days off. Go back lighter. Strength returns faster than it took to build.', s.daysOff]] : []),
    ...(s.missed === 1 ? [["You skipped a planned day. Don't make it two."]] : []),
    ...(s.missed >= 1 ? [["Missed one? Just do the next session. Don't try to double up."]] : []),
    ...(s.missed > 1 ? [['You planned {0} sessions this week. You did {1}.', s.planned, s.planned - s.missed], ['{0} planned days skipped. Fix it today.', s.missed]] : []),
    ...(s.today && !s.trainedToday ? [['{0} is today. Short on time? Do just the first two lifts.', s.today]] : []),
    ...(s.volTrend != null && s.volTrend < 0.7 ? [["You're doing a lot less than a few weeks ago. What changed?"]] : []),
    ...(s.stalled.length ? [['{0} is stuck. Something has to change.', s.stalled[0]], ['{0} is stuck. Drop 10% and build back up. It usually breaks through.', s.stalled[0]]] : [])
  ],
  lowAny: () => [
    ["I'm not mad. I'm disappointed. Also mad."],
    ['No excuses today.'],
    ['Less scrolling. More lifting.'],
    ['Short on time? 20 minutes beats zero.'],
    ['Just start the warm-up. Motivation shows up after, not before.'],
    ["A bad workout still counts. A skipped one doesn't."],
    ['Pack your gym bag tonight. One less excuse tomorrow.']
  ]
}
const say = ([tpl, ...args]) => { const v = t(tpl, ...args); return v.charAt(0).toUpperCase() + v.slice(1) }
const one = (rng, arr) => arr[Math.floor(rng() * arr.length)]

/** What it says in this mood, or null — silence is part of it. */
export function coachLine(mood, s, rng) {
  if (s.freshPR) return say(one(rng, LINES.pr(s)))
  const moment = coachMoment(s)
  if (moment) return say(one(rng, LINES[moment](s)))
  if (mood === 'drowsy') {
    if (rng() >= 0.6) return null
    if (rng() < 0.5) { const [tpl, ...args] = one(rng, LINES.night(s)); return t(tpl, ...args) }
    return say(one(rng, LINES.late(s)))
  }
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
