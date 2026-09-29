// Everything Peek says outside Home's mood line (that one lives in coach.js with its scoring).
// One place for the voice, so it stays one character: short, deadpan, caring but hiding it,
// no emojis, numbers only from the user's own log. See docs/PEEK.md.
//
// An entry is a template, or { t, min, max, tone }:
//   min / max — bond stages it's allowed at (memory.js: 0 stranger … 3 ride or die)
//   tone      — 'hard' is dropped for the gentle honesty setting, 'soft' for brutal
// Templates are filled by t(), so {0} {1} come from the caller's args and translate later.
import { t } from '../i18n.js'

export const LINES = {
  /* ---- workout: key moments only (it never talks during a set) ---- */
  start: ["Let's go.", 'Okay. Show me.', { t: 'Here we go again. Good.', min: 1 }, { t: 'Same time, same place. I like this.', min: 2 }],
  pr: ['{0}. New best. Keep going.', '{0} PR. Right there.', "That's a new best on {0}.", { t: '{0} just went up. I felt that.', min: 2 }],
  missedTwice: [
    'Heavy today. Drop a little if you need to.',
    'Two short sets. Rest longer, not less.',
    { t: 'Missing reps. Go lighter, nobody is watching.', tone: 'soft' },
    { t: "Two misses in a row. Don't make it three.", tone: 'hard' }
  ],
  restLong: ["Rest's over. I'm not getting any younger.", "Still resting? The bar isn't.", 'That rest was {0} minutes. Next set.', { t: 'Phone down. Next set.', tone: 'hard' }],
  idle: ['Hello? Still here?', 'Did you leave?', "{0} minutes without a set. I'm falling asleep."],
  lastSet: ['Last set. Make it count.', 'One more. Then we talk.', "Last one. Don't waste it."],
  finishEarly: ['{0} sets left. We both saw that.', 'Leaving {0} sets on the table?', { t: 'Really? {0} sets to go.', tone: 'hard' }, { t: 'You sure? {0} sets left.', tone: 'soft' }],
  nothingLogged: ['Nothing logged. What was that?', 'Zero sets. Bold strategy.'],
  quitEarly: ['You just got here.', 'Discarding already? Hm.', { t: 'Quitting after {0} minutes. Noted.', tone: 'hard' }],

  /* ---- home, beyond the mood line ---- */
  leftWorkout: ["You're still in the middle of {0}.", "{0} isn't finished. I'm waiting.", 'Go back. {0} is still open.'],
  restDay: ['Rest day. Actually rest.', 'Nothing planned. Recover properly.', "Rest day. I'll allow it."],
  asleep: ["It's {0}. Why are we awake.", 'Mm. Go to sleep.', 'Sleep is training too. Go.'],
  reunion: [
    { t: "Oh. You're back.", max: 0 }, { t: "Hey. It's been a while.", max: 0 },
    { t: "Oh. You're back. {0} days.", min: 1 }, { t: 'Look who remembered me.', min: 1, max: 2 },
    { t: '{0} days. I kept your spot.', min: 2 }, { t: "You're back. Let's not do that again.", min: 2 },
    { t: 'Finally. {0} days. I missed this.', min: 3 }
  ],
  stage1: ["I'm starting to like this."],
  stage2: ["Okay. We're a team now."],
  stage3: ["You and me. Every week. That's the deal."],

  /* ---- finish journey ---- */
  finishOpen: ['Hold on. Let me look at this.', "Okay. Let's see.", 'Done. Let me check something.'],
  first: ["First one. I'll remember this.", 'Session one. Everyone starts here.'],
  verdictPR: ['{0} PR. I saw that. Proud of you.', "New best on {0}. Don't get comfy.", { t: '{0}. New best. This is the version of you I like.', min: 2 }],
  verdictPRs: ['{0} PRs today. Who are you?', "{0} new bests. I'm not crying, you are."],
  verdictGood: ["More than last time. That's the whole game.", 'Solid. Now do it again.', '{0} more than last time. I noticed.', { t: 'This is the version of you I like.', min: 2 }],
  verdictMeh: ['Same as last time. Fine. Next time, one more rep.', 'Done. Not great, not bad.', { t: 'It counts. Barely.', tone: 'hard' }, { t: 'It counts. That matters.', tone: 'soft' }],
  verdictBad: ['Lighter than last time. Everyone has days.', { t: "Less than last time. Tomorrow's you won't be impressed.", tone: 'hard' }, { t: 'A lighter day. Still showed up.', tone: 'soft' }],
  verdictShort: [
    '{0} sets left on the table. We both saw that.',
    { t: "Finished early. I'm not mad. I'm disappointed. Also mad.", tone: 'hard' },
    { t: 'Short one today. Next time, all of it.', tone: 'soft' }
  ],
  milestone: ["That's session {0}. I've been counting.", '{0} sessions. Look at you.'],
  comeback: ["Back after {0} days. That's what matters.", 'You came back. That was the hard part.'],

  /* ---- memory callbacks (memory.js decides when one is true) ---- */
  cbEarly: [{ t: 'Last time you finished early. Not today, right?', min: 1 }],
  cbPRs: [{ t: '{0} PRs this month. Keep that up.', min: 1 }],
  cbSkipDay: [{ t: "You've skipped {0} two weeks running.", min: 1 }, { t: '{0} again? You keep missing it.', min: 2, tone: 'hard' }],
  cbSince: [{ t: '{0} days since your first session. Still here.', min: 2 }],
  cbPoked: [{ t: 'Still annoyed about the poking.', min: 1 }],
  cbRare: [{ t: 'Nobody else gets this face.', min: 3 }, { t: 'Same time tomorrow?', min: 3 }],

  /* ---- stats ---- */
  statsUp: ['{0} is up {1} in six weeks.', '{0} keeps climbing. {1} in six weeks.'],
  statsStuck: ["{0} hasn't moved in {1} weeks.", { t: '{0} is stuck. {1} weeks now. Change something.', tone: 'hard' }],
  statsNone: ["Keep logging. I'll find something to say."],

  /* ---- empty screens, errors ---- */
  emptyHistory: ['Nothing here yet. Go make some history.'],
  emptyPlan: ['No plan. Bold. Make one, or load the starter plan.'],
  emptyFreestyle: ["Freestyle. Add your first exercise, I'll watch."],
  emptyProgress: ["Log this once and I'll start keeping score."],
  offline: ["Can't reach the server. I'll remember it for later."]
}

const norm = e => (typeof e === 'string' ? { t: e } : e)
const allowed = (e, stage, honesty) =>
  (e.min == null || stage >= e.min) && (e.max == null || stage <= e.max) &&
  !(honesty === 'gentle' && e.tone === 'hard') && !(honesty === 'brutal' && e.tone === 'soft')

export const fill = (tpl, args = []) => { const v = t(tpl, ...args); return v.charAt(0).toUpperCase() + v.slice(1) }

/**
 * One line for a situation, or null when nothing fits this bond stage / honesty.
 * Lines in `said` (recent templates) are avoided while there's anything else to say.
 * Returns { key, text } — `key` is the template, for memory's `said` list.
 */
export function pickLine(situation, args = [], rng = Math.random, { stage = 0, honesty = 'normal', said = [] } = {}) {
  const ok = (LINES[situation] || []).map(norm).filter(e => allowed(e, stage, honesty))
  if (!ok.length) return null
  const fresh = ok.filter(e => !said.includes(e.t))
  const pool = fresh.length ? fresh : ok
  const e = pool[Math.floor(rng() * pool.length)]
  return { key: e.t, text: fill(e.t, args) }
}
