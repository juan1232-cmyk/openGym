# Peek

Peek is the orb: a black sphere with two eyes that lives in the app as a companion and coach.
This page is the character bible — who it is, what it does where, and where that lives in the
code. Change the character here first, then in code.

## Who Peek is

- **Voice**: short (usually under a dozen words), deadpan, cares but hides it. No emojis,
  almost no exclamation marks.
- **Honest**: every number it says comes from your own log. It never makes one up.
- **Hard lines**: never comments on bodyweight or appearance, never talks during a set.
- **Silence is a line**: sometimes it just looks at you.
- **Body language first**: its face reacts to everything; words are rarer, so they matter.
- **Unpredictable on purpose**: moods come from a blend of signals plus seeded noise, now
  and then from the neighbouring mood band, and some turns say nothing. You shouldn't be able
  to learn "X always makes it do Y". The one promise: **a PR is always celebrated.**

## Memory and the bond

Stored in the synced state as `S.peek` (see `PEEK_DEF` in `frontend/src/lib/peek/memory.js`),
written only through the store's `update()`.

| Stage | Bond | What changes |
|---|---|---|
| Stranger | 0–14 | Polite, curious, sometimes shy. Never brings up the past. |
| Gym acquaintance | 15–44 | Starts teasing, notices patterns (a weekday you keep skipping). |
| Training partner | 45–79 | Callbacks to your history, harsher honesty. |
| Ride or die | 80+ | Inside jokes, and faces nothing else uses (the `cheeky` mood). |

- About +4 bond per session (more on plan, with a PR, or coming back after a week;
  +0.5 for finishing early). It fades by 0.5 a day after a week away.
- **Moments** it remembers (last 30, the first session never drops): first session, PRs,
  comebacks, milestones (10, 25, 50, 100… sessions), finishing early, being poked to anger.
- **Carry**: yesterday's mood leaks into today's, so it stays a bit grumpy after a skip.
- **Said**: the last dozen lines, so it doesn't repeat itself.

Settings → Peek: **Talks** (off = faces only), **Notifications in its voice**, and
**Honesty** — gentle (never angry, soft lines), normal, brutal (angrier, harder lines).

## Where it shows up

**Home** — mood and a line from your data (`coach.js`): proud when you train and progress,
direct and angry when you don't. Asleep between midnight and 6 (tap to wake it, grumpily).
A reunion the first time you open the app after 5+ days away: cold blue first, then
"Oh. You're back." Suspicious if a workout was left open. Poke it three times and it's
suspicious; six and it turns red — and remembers it for a few days.

**During a workout** — focused face; every checked set gets a reaction (on target: happy,
beat it: surprised, short: skeptical). It only talks at these moments (`moments.js`):
a PR mid-set, two short sets in a row on one lift, a rest past twice the rest timer, ten
minutes without a set, the last set, finishing early, discarding a planned session in its
first five minutes.

**Finish journey** — a few screens in a row (`journeySteps`): the whole story on a PR day
(numbers, the record, what you trained, next time, Peek's verdict), three screens on a normal
day, a "left behind" screen when you finish early, and its own opening for the very first
session. The verdict's second line is what it remembers: a new bond stage, a milestone, a
comeback.

**Notifications** (`api/peek-lines.js`) — "Rest over" and the day reminder in its voice;
one nudge each at 3, 7 and 14 days since the last workout, then silence.

**Stats** — one remark on the big picture: the lift that climbed most in six weeks, or one
stuck at the same top weight for five or more. **Exercise progress** — the coach note's face
follows the trend. **Empty screens** (history, plan, freestyle, progress), **offline sync**,
**sign-in** ("Hey. I'm Peek.") and the **goals** step all have it too.

## Code map

| File | What |
|---|---|
| `frontend/src/lib/orb-rig.js` | the face: every expression from `grok-bot.avatar.json`, and `MOODS` |
| `frontend/src/components/Orb.jsx` | the orb component (`mood`, `onPoke`, `ref.react`) |
| `frontend/src/lib/peek/coach.js` | Home's brain: signals → score → mood → line; the Stats remark |
| `frontend/src/lib/peek/memory.js` | bond, moments, carry, reunion, callbacks |
| `frontend/src/lib/peek/moments.js` | workout moments, the finish journey's steps and verdict |
| `frontend/src/lib/peek/lines.js` | everything else it says, by situation, stage and honesty |
| `frontend/src/store/peek.js` | reading and writing `S.peek`, `sayNow()` |
| `frontend/src/components/PeekSay.jsx`, `PeekNote.jsx` | the speech bubble, notes and empty states |
| `api/peek-lines.js` | its voice in push notifications (a copy — the api image can't import the frontend) |

All of `lib/peek` is pure and tested (`*.test.js` beside each file).
