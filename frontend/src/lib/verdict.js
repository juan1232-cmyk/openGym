// The orb's verdict: is this profile actually getting stronger? Pure — no React, no storage.
//
// Unlike the coach's moods, this is deliberately readable: the same log always gives the same
// verdict, so the orb can be trusted as a progress signal. The coach only decides how to *say*
// it (which face, which line); it never blurs which verdict it is.
//
// A lift's direction comes from the same series the exercise progress page charts
// (progressSeries — the estimated 1RM where the log supports one) fitted with the same
// trendPer14, so Home and that page can't disagree about a lift. e1RM rather than weight on
// the bar on purpose: double progression adds reps at a fixed weight first, and that is
// progress the bar weight alone would call flat.
import { isoOf } from './format.js'
import { modeOf } from './history.js'
import { sessionsFor, stallCount } from './progression.js'
import { progressSeries, trendPer14 } from './progress.js'

const DAY = 864e5
const dayNum = iso => Math.round(new Date(iso + 'T12:00:00').getTime() / DAY)

// Tunables — all in one place so the verdict can be adjusted after living with it.
export const MIN_SESSIONS = 3        // fewer than this and there is nothing to judge yet
export const AWAY_DAYS = 10          // this long without training and progress is moot
export const STALL_LIFTS = 2         // this many planned lifts stuck → "stalled"
export const STALL_SESSIONS = 2      // a lift is stuck after this many missed sessions running
export const RECENT_DAYS = 28        // a lift only counts if it was trained this recently
export const FLAT_PCT = 0.01         // less than 1% per two weeks is holding, not moving
const TREND_POINTS = 8               // the progress page fits the last 8 sessions too

export const VERDICTS = ['new', 'away', 'stalled', 'slipping', 'progressing', 'holding']

// One lift's direction: 'up' | 'flat' | 'down', or null when it hasn't been trained recently or
// there isn't enough of it to call a trend. Cardio has no "stronger" and is skipped.
export function liftTrend(S, exId, now = new Date()) {
  const { kind, points } = progressSeries(S, exId)
  if (kind === 'speed' || !points.length) return null
  // imported sessions can lack a clock time; their day is close enough for a two-week trend
  const pts = points.slice(-TREND_POINTS).map(p => ({ ...p, t: p.t || dayNum(p.d) * DAY }))
  if (dayNum(isoOf(now)) - dayNum(pts[pts.length - 1].d) > RECENT_DAYS) return null
  const rate = trendPer14(pts)
  if (rate == null) return null
  const mean = pts.reduce((n, p) => n + p.y, 0) / pts.length
  const dir = Math.abs(rate) < mean * FLAT_PCT ? 'flat' : rate > 0 ? 'up' : 'down'
  return { dir, rate }
}

// A planned lift that missed its target STALL_SESSIONS times running and is still trained.
// Only planned lifts: without a target to miss, every session would read as a miss.
export function liftStalls(S, cfg, now = new Date()) {
  const ss = sessionsFor(S, cfg.id, cfg)
  if (!ss.length || dayNum(isoOf(now)) - dayNum(ss[ss.length - 1].d) >= 21) return 0
  return stallCount(ss)
}

/** { state, daysOff, up, flat, down, stalled, prs } — names via `nameOf`. */
export function progressVerdict(S, now = new Date(), nameOf = id => id) {
  const ws = S.workouts || []
  const today = dayNum(isoOf(now))
  const ago = w => today - dayNum(w.d)
  const daysOff = ws.length ? Math.min(...ws.map(ago).filter(n => n >= 0)) : null
  const prs = ws.filter(w => ago(w) >= 0 && ago(w) < 14).reduce((n, w) => n + ((w.prs && w.prs.length) || 0), 0)

  // every lift trained lately, planned or not — a freestyle profile is still progressing
  const up = [], flat = [], down = [], stalled = []
  const ids = new Set()
  ws.filter(w => ago(w) <= RECENT_DAYS).forEach(w => (w.entries || []).forEach(e => ids.add(e.id)))
  ids.forEach(id => {
    const tr = liftTrend(S, id, now)
    if (tr) ({ up, flat, down })[tr.dir].push(nameOf(id))
  })
  const seen = new Set()
  ;(S.routines || []).forEach(r => (r.ex || []).forEach(e => {
    if (seen.has(e.id) || modeOf(e) === 'cardio' || !(e.reps || e.sec)) return
    seen.add(e.id)
    if (liftStalls(S, e, now) >= STALL_SESSIONS) stalled.push(nameOf(e.id))
  }))

  const state = ws.length < MIN_SESSIONS ? 'new'
    : daysOff >= AWAY_DAYS ? 'away'
      : stalled.length >= STALL_LIFTS ? 'stalled'
        : down.length > up.length ? 'slipping'
          : up.length > down.length || prs > 0 ? 'progressing'
            : 'holding'
  return { state, daysOff, up, flat, down, stalled, prs }
}

/**
 * How one finished workout compared with the last time it was done:
 * 'record' | 'first' | 'more' | 'same' | 'less'. A record wins whatever the volume did —
 * a heavy single on a light day is still the best news of the session.
 */
export function sessionVerdict({ prs = [], e1prs = [], vol = 0, prevVol = null }) {
  if (prs.length || e1prs.length) return 'record'
  if (!prevVol) return 'first'
  const r = vol / prevVol
  return r > 1.02 ? 'more' : r < 0.9 ? 'less' : 'same'
}

/**
 * One checked set against the same set last time: 'beat' | 'match' | 'short', or null when
 * there's nothing comparable (no history, cardio). Heavier counts as beating it whatever the
 * reps; lighter with more reps is called even rather than guessed at.
 */
export function setVsLast(set, prev) {
  if (!set || !prev) return null
  const cmp = (a, b) => (a > b ? 'beat' : a === b ? 'match' : 'short')
  if (set.sec != null || prev.sec != null) return cmp(set.sec || 0, prev.sec || 0)
  if (set.r == null && set.w == null) return null
  const w = set.w || 0, pw = prev.w || 0
  if (w !== pw) return w > pw ? 'beat' : (set.r || 0) > (prev.r || 0) ? 'match' : 'short'
  return cmp(set.r || 0, prev.r || 0)
}
