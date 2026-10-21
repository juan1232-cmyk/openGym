import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useRatings } from '../store/useRatings.js'
import { useUI } from '../store/useUI.js'
import { EXIDX } from '../lib/exercises.js'
import { lastBW, streakWeeks } from '../lib/history.js'
import { fmtNum, fmtDate, fmtDur, fmtVol, todayISO, isoOf } from '../lib/format.js'
import { t, dateLocale } from '../lib/i18n.js'
import { fixAction, applyFix, undoFix, fixDone, swapPending } from '../lib/liftfix.js'
import { bwSheet, calendarSheet } from '../sheets.jsx'
import { loadOfWorkouts, rankOf, MUSCLE_NAME } from '../lib/muscles.js'
import {
  rangeBounds, prevBounds, inRange, volumeOf, minutesOf, adherence, buckets, bucketBy,
  weeksTrained, personalBests, mainLift, liftsToWatch, weeklySets, setZone, ZONES, MAJOR,
  mainLiftsWeek, bwPace, weekdayPattern
} from '../lib/stats.js'
import { WEEKLY_ZONES, HEAVY_REPS, MAIN_LIFT_FREQ } from '../lib/engine-config.js'
import BodyMap from '../components/BodyMap.jsx'
import Spark from '../components/Spark.jsx'
import Icon from '../components/Icon.jsx'
import Orb from '../components/Orb.jsx'
import { Thumb } from '../components/Media.jsx'
import { Button, Segmented } from '../components/ui.jsx'

// Stats, design A ("one range drives every tile"): a single range at the top and every card
// below reads the same window, so no two numbers on the page disagree about which workouts
// they mean. Small marks — a ring, a streak strip, mini bars, sparklines — instead of a stack
// of full line charts; the full curves are one tap away on an exercise's own page.

const RANGES = [
  { value: 7, label: 'Week' }, { value: 30, label: '30d' }, { value: 90, label: '90d' },
  { value: 365, label: '1Y' }, { value: 0, label: 'All' }
]
const STRIP_WEEKS = 12
const nameOf = id => (EXIDX[id] || {}).n || id
const toast = m => useUI.getState().toast(m)
const inLabel = days => (days === 7 ? t('this week') : days ? t('in {0} days', days) : t('all time'))

function dayLabel(iso) {
  const today = todayISO()
  if (iso === today) return t('Today')
  const y = new Date(); y.setDate(y.getDate() - 1)
  return iso === isoOf(y) ? t('Yesterday') : fmtDate(iso, true)
}

// Days trained against days planned, as a closing ring. No plan → the ring just fills once
// there is any training, since there is nothing to measure it against.
function Ring({ done, planned }) {
  const R = 22, C = 2 * Math.PI * R
  const p = planned ? Math.min(1, done / planned) : done ? 1 : 0
  return <svg className="sa-ring" viewBox="0 0 56 56" aria-hidden="true">
    <circle cx="28" cy="28" r={R} className="bg" />
    <circle cx="28" cy="28" r={R} className={'fg' + (planned && done >= planned ? ' full' : '')}
      strokeDasharray={C} strokeDashoffset={C * (1 - p)} />
  </svg>
}

function Delta({ pct }) {
  if (pct == null) return null
  const r = Math.round(pct * 100)
  return <span className={'sa-delta ' + (r > 0 ? 'up' : r < -10 ? 'down' : '')}>{(r > 0 ? '+' : '') + r + '%'}</span>
}

// Which muscles the range hit, as effective sets per week (hard sets count in full, easy ones
// less — lib/effort.js setCredit) against the four weekly zones in lib/engine-config.js. The
// bar's track runs to 25 a week with the zones drawn on it, so "productive" is a place on the
// bar rather than a number to remember. The chips are the big muscle groups in the lowest
// zone — the ones to add a few sets for.
const TRACK = 25
const [Z_LOW, Z_OK, Z_HIGH] = WEEKLY_ZONES
const ZONE_NAME = { under: 'Too little', ok: 'OK', productive: 'Productive', over: 'Diminishing' }
const ZONE_RANGE = { under: '<' + Z_LOW, ok: Z_LOW + '–' + Z_OK, productive: Z_OK + '–' + Z_HIGH, over: '>' + Z_HIGH }
function MuscleBalance({ S, ws, b }) {
  const [sel, setSel] = useState(null)
  const load = loadOfWorkouts(ws)
  const pw = weeklySets(load, b)
  const { worked } = rankOf(load)
  const top = worked.slice(0, 4)
  // the furthest behind first, and only a handful — nine orange chips is a wall, not a hint
  const under = MAJOR.filter(m => setZone(pw[m]) === 'under').sort((x, y) => (pw[x] || 0) - (pw[y] || 0))
  const perWk = m => t('{0}/wk', fmtNum(pw[m] || 0))
  const pct = v => v / TRACK * 100 + '%'
  return <div className="card sa-card">
    <div className="pk-card-h">
      <b>{t('Muscle balance')}</b>
      <span>{sel ? t(MUSCLE_NAME[sel]) + ' · ' + (pw[sel] ? perWk(sel) + ' · ' + t(ZONE_NAME[setZone(pw[sel])]) : t('not trained')) : t('Effective sets per week')}</span>
    </div>
    {ws.length ? <>
      <div className="sa-mb">
        <BodyMap className="tappable" load={load} body={S.body} selected={sel} onMuscle={m => setSel(s => (s === m ? null : m))} />
        <div className="sa-mlist">{top.map(m => <div key={m} className={'sa-m ' + setZone(pw[m])}>
          <div className="row between"><span>{t(MUSCLE_NAME[m])}</span><span className="mono">{perWk(m)}</span></div>
          <i style={{ '--z0': pct(Z_LOW), '--z1': pct(Z_OK), '--z2': pct(Z_HIGH) }}>
            <b style={{ width: Math.min(100, (pw[m] || 0) / TRACK * 100) + '%' }} />
          </i>
        </div>)}</div>
      </div>
      <div className="sa-zones">{ZONES.map(z => <span key={z} className={z}><i />{t(ZONE_NAME[z])} <em>{ZONE_RANGE[z]}</em></span>)}</div>
      {under.length > 0 && <div className="sa-miss">
        <span>{t('Under {0}/wk', Z_LOW)}</span>
        {under.slice(0, 5).map(m => <button key={m} className="mchip miss" onClick={() => setSel(m)}>{t(MUSCLE_NAME[m])}</button>)}
        {under.length > 5 && <span>+{under.length - 5}</span>}
      </div>}
      <div className="sa-note">{t('Effective sets: a set near failure counts as one, an easy one less. {0}–{1} a week is the productive band; past {1} more sets mostly add tiredness.', Z_OK, Z_HIGH)}</div>
    </> : <div className="muted small" style={{ marginTop: 10 }}>{t('No workouts in this period yet.')}</div>}
  </div>
}

// What Peek suggests: one short line, the number in it, readable at a glance between sets. The
// why is left to the row above, which already says what's wrong with the lift — except for a
// lighter week leading, where "too heavy" or "tired" is the reason to take it.
// `act` is what accepting it would change (lib/liftfix.js fixAction).
const shortDate = iso => new Date(iso + 'T12:00:00').toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short' })
// two decimals, not fmtNum's one: a 1.25 kg step or a 63.75 kg deload is a real plate load,
// and "1.3 kg" isn't one
const kg = (v, S) => v.toLocaleString(dateLocale(), { maximumFractionDigits: 2 }) + ' ' + S.unit
const one = act => act.routines[0]
function fixSay(f, act, S, x) {
  if (f.kind === 'sets') return t('Add one more set ({0} → {1}).', one(act).from, one(act).to)
  if (f.kind === 'steps') return t('Add {0} at a time, not {1}.', kg(one(act).to, S), kg(one(act).from, S))
  if (f.kind === 'double') return t('Do more reps first ({0} → {1}), then add weight.', one(act).low, one(act).high)
  if (f.kind === 'swap') return t('Try {0} this week.', nameOf(act.to))
  if (x.kind === 'stuck') return t('Too heavy right now. Go lighter for a week: {0}.', kg(act.w, S))
  if (x.kind === 'down') return t('You’re tired. Go lighter for a week: {0}.', kg(act.w, S))
  return t('Go lighter for a week ({0}), then push again.', kg(act.w, S))
}
const FIX_BUTTON = { sets: 'Add a set', steps: 'Smaller jumps', double: 'More reps first', swap: 'Swap', deload: 'Go lighter' }
// the week a swap is in, from the routine entry (until is set by the first session with it)
const swapUntil = (S, id) => (S.routines || []).flatMap(r => r.ex || []).find(c => c.id === id && c.swap)?.swap.until
function fixDoneLine(m, S, id) {
  if (m.kind === 'sets') return t('Added a set: {0} → {1}.', one(m).from, one(m).to)
  if (m.kind === 'steps') return t('Adding {0} at a time.', kg(one(m).to, S))
  if (m.kind === 'double') return t('More reps first: {0} → {1}.', one(m).low, one(m).high)
  if (m.kind === 'swap') {
    const until = swapUntil(S, id)
    return until ? t('This week: {0}, until {1}.', nameOf(m.to), shortDate(until)) : t('Next time: {0}.', nameOf(m.to))
  }
  return t('Lighter week: {0} until {1}.', kg(m.w, S), shortDate(m.until))
}
function fixToast(act, S) {
  if (act.kind === 'sets') return t('Added a set')
  if (act.kind === 'steps') return t('Smaller jumps: {0}', kg(one(act).to, S))
  if (act.kind === 'double') return t('More reps first')
  if (act.kind === 'swap') return t('Next time: {0}', nameOf(act.to))
  return t('Lighter week: {0}', kg(act.w, S))
}
// Whether an accepted fix can still be taken back: a swap while it's waiting or in its week
// (undo ends it early), a deload while its week lasts. The lasting changes always can.
const undoable = (S, id, m) => (m.kind === 'swap' ? swapPending(S, id) : m.kind === 'deload' ? m.until >= todayISO() : true)
// How long Peek "thinks" before a swap or another idea: long enough to read as coming up with
// something, short enough not to feel like waiting. None with reduced motion.
const THINK_MS = 900
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

// Peek's take on one lift: what's already been done for it (each with an undo), then the one
// thing it suggests next, with the button that does it — one tap, no "are you sure", since it
// can be undone right there. "Another idea" moves on to the next suggestion, round and round.
// A swap and another idea are Peek coming up with something, so both get a moment of thinking
// first — eyes up, dots in the bubble — before the answer lands.
function PeekFixes({ S, x }) {
  const orb = useRef(null)
  const tm = useRef(0)
  const update = useStore(s => s.update)
  const [n, setN] = useState(0)
  const [thinking, setThinking] = useState(false)
  useEffect(() => () => clearTimeout(tm.current), [])
  const done = x.fixes.map(f => fixDone(S, x.id, f.kind)).filter(Boolean)
  const ideas = x.fixes.filter(f => !fixDone(S, x.id, f.kind))
    .map(f => ({ f, act: fixAction(S, x.id, f) })).filter(i => i.act)
  const idea = ideas.length ? ideas[n % ideas.length] : null
  const think = then => {
    if (reducedMotion()) return then()
    setThinking(true)
    orb.current?.react('upward-side-glance', THINK_MS)
    tm.current = setTimeout(() => { setThinking(false); then() }, THINK_MS)
  }
  const apply = f => {
    let act = null
    update(s => { act = applyFix(s, x.id, f) })
    if (!act) return
    setN(0)
    orb.current?.react('joyful-wide', 900)
    orb.current?.bump('nod')
    toast(fixToast(act, S))
  }
  const accept = f => (f.kind === 'swap' ? think(() => apply(f)) : apply(f))
  const undo = kind => { update(s => { undoFix(s, x.id, kind) }); toast(t('Undone')) }
  return <div className="sa-peek">
    <Orb ref={orb} size={30} mood="curious" poke="joyful-wide" />
    <div className="sa-say" aria-live="polite">
      {done.map(m => <div key={m.kind} className="sa-sug done">
        <Icon name="check" /><span>{fixDoneLine(m, S, x.id)}</span>
        {undoable(S, x.id, m) && <button className="undo" onClick={() => undo(m.kind)}>{t('Undo')}</button>}
      </div>)}
      {thinking ? <p className="sa-sug think">{t('Hmm, let me think')}<i /><i /><i /></p>
        : idea ? <div className="sa-sug idea">
          <span>{fixSay(idea.f, idea.act, S, x)}</span>
          <div className="acts">
            <Button size="sm" variant="tinted" onClick={() => accept(idea.f)}>{t(FIX_BUTTON[idea.f.kind])}</Button>
            {ideas.length > 1 && <button className="more" onClick={() => think(() => setN(i => i + 1))}>{t('Another idea')}</button>}
          </div>
        </div> : <p className="sa-sug off">{done.length
          ? t('That’s all for now. Give it a week or two.')
          : t('Add it to a routine and I can help.')}</p>}
    </div>
  </div>
}

// Lifts to act on now — stuck on their target, with an estimate that's falling, or with no
// new estimated best in a while (and what Peek would do about it). Each row is the lift's own
// picture, as in the Exercises tab, with a one-word tag for what's wrong; tapping it opens the
// same exercise screen the Exercises tab does.
const TAG = { stuck: 'Stuck', flat: 'Flat', down: 'Dropping' }
function LiftsToWatch({ S }) {
  const nav = useNavigate()
  const list = liftsToWatch(S).slice(0, 4)
  return <div className="card sa-card">
    <div className="pk-card-h"><b>{t('Lifts to watch')}</b><span>{t('Right now')}</span></div>
    {list.length ? list.map(x => <div key={x.id} className="sa-watch">
      <button className="sa-pb" onClick={() => nav('/exercise/' + x.id)}>
        <Thumb ex={EXIDX[x.id] || { id: x.id }} />
        <span className="l"><b>{nameOf(x.id)}</b><span className="sa-why"><em className={x.kind}>{t(TAG[x.kind])}</em>{x.kind === 'stuck'
          ? t('Missed reps {0} times', x.n)
          : x.kind === 'flat'
            ? t('No progress in {0} sessions', x.n)
            : t('Getting weaker lately')}</span>
        </span>
        <Icon name="chevronRight" className="chev" />
      </button>
      {x.fixes.length > 0 && <PeekFixes S={S} x={x} />}
    </div>) : <div className="muted small" style={{ marginTop: 10 }}>{t('Nothing stuck. Every lift you train is holding or moving up.')}</div>}
  </div>
}

// The strength side of the week, which effective sets don't show: heavy sets per main lift,
// and the lifts trained less than twice. Always this calendar week, whatever the range —
// like Lifts to watch, it's about what to do next, and only this week can still change.
function MainLifts({ S }) {
  const nav = useNavigate()
  useRatings()      // which lifts are main lifts depends on the ratings table
  const list = mainLiftsWeek(S.workouts).slice(0, 5)
  if (!list.length) return null
  return <div className="card sa-card">
    <div className="pk-card-h"><b>{t('Main lifts')}</b><span>{t('This week')}</span></div>
    {list.map(x => (
      <button key={x.id} className="sa-pb" onClick={() => nav('/exercise/' + x.id)}>
        <span className={'ic' + (x.few ? ' few' : '')}><Icon name={x.few ? 'lightbulb' : 'check'} /></span>
        <span className="l"><b>{nameOf(x.id)}</b><span className={x.few ? 'warn' : ''}>{x.sessions === 1
          ? t('Once so far. Twice a week builds strength faster.')
          : x.sessions === 0 ? t('Not yet this week') : t('{0}× this week', x.sessions)}</span></span>
        <span className="v">{t('{0} heavy', x.heavy)}</span>
      </button>
    ))}
    <div className="sa-note">{t('Heavy = {0} reps or fewer. Main lifts are the big compound movements; aim for {1} sessions each a week.', HEAVY_REPS, MAIN_LIFT_FREQ)}</div>
  </div>
}

// Planned days hit, per weekday — and the one that keeps getting skipped, if there is one.
const WEEKDAY = wd => new Date(2026, 0, 5 + wd).toLocaleDateString(dateLocale(), { weekday: 'long' })
const WEEKDAY_1 = wd => new Date(2026, 0, 5 + wd).toLocaleDateString(dateLocale(), { weekday: 'narrow' })
function WeekPattern({ S, b, ws }) {
  const { days, worst } = weekdayPattern(S, b)
  const anyPlan = days.some(d => d.planned)
  const weeks = Math.max(1, (new Date(b.to + 'T12:00:00') - new Date(b.from + 'T12:00:00')) / 6048e5 + 1 / 7)
  return <div className="card sa-card">
    <div className="pk-card-h"><b>{t('Your week')}</b><span>{t('{0} sessions a week', fmtNum(ws.length / weeks))}</span></div>
    {anyPlan ? <>
      <div className="sa-wd">{days.map(d => (
        <div key={d.wd} className={d === worst ? 'worst' : ''}>
          <i>{d.done ? <b style={{ height: Math.max(6, d.done / d.planned * 100) + '%' }} /> : null}</i>
          <span className="n">{d.planned ? d.done + '/' + d.planned : '—'}</span>
          <span>{WEEKDAY_1(d.wd)}</span>
        </div>
      ))}</div>
      <div className="sa-note">{worst
        ? t('You miss {0} most: {1} of the last {2}. Worth moving that session?', WEEKDAY(worst.wd), worst.planned - worst.done, worst.planned)
        : t('No weekday you keep skipping. Planned days hit, last {0} weeks or more.', 8)}</div>
    </> : <div className="muted small" style={{ marginTop: 10 }}>{t('Set a weekly plan to see which days you hit.')}</div>}
  </div>
}

export default function Stats() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const [days, setDays] = useState(30)

  const now = new Date()
  const b = rangeBounds(days, now, S.workouts)
  const ws = inRange(S.workouts, b)
  const pb = prevBounds(b, days)
  const vol = volumeOf(ws)
  const prevVol = pb ? volumeOf(inRange(S.workouts, pb)) : 0
  const adh = adherence(S, b)
  const bk = buckets(S.workouts, b, bucketBy(days))
  const maxVol = Math.max(0, ...bk.map(x => x.vol))
  const mins = ws.reduce((n, w) => n + minutesOf(w), 0)
  const strip = weeksTrained(S.workouts, STRIP_WEEKS, now)
  const streak = streakWeeks(S)

  // Body weight over the range; a range with fewer than two weigh-ins borrows the last few,
  // so the tile still has a shape for someone who weighs in once a month.
  const bw = lastBW(S)
  const bwIn = S.bodyweight.filter(x => x.d >= b.from && x.d <= b.to)
  const bwSeries = (bwIn.length > 1 ? bwIn : S.bodyweight.slice(-8)).map(x => x.w)
  const toGoal = bw && S.targetW ? S.targetW - bw.w : null
  const pace = bwPace(S.bodyweight, S.targetW, now)
  const paceLine = pace ? (pace.perWeek > 0 ? '+' : pace.perWeek < 0 ? '−' : '') + fmtVol(Math.abs(pace.perWeek), S.unit) + ' ' + t('a week') : null
  const goalLine = toGoal == null ? null
    : Math.abs(toGoal) < 0.05 ? t('Goal reached')
      : !pace ? t('{0} to goal', fmtVol(Math.abs(toGoal), S.unit))
        : pace.dir === 'toward' ? (pace.eta ? t('Goal around {0}', fmtDate(pace.eta)) : t('Goal over a year out'))
          : pace.dir === 'away' ? t('Moving away from goal') : t('Holding steady')

  const lift = mainLift(S, b)
  const prs = personalBests(S, b)

  return <>
    <div className="hdr"><div><h1>{t('Stats')}</h1><div className="sub">{t('Progress & history')}</div></div>
      <button className="iconbtn" onClick={() => nav('/history')} aria-label={t('History')}><Icon name="history" /></button></div>

    <Segmented className="seg-range" value={days} onChange={setDays} options={RANGES.map(r => ({ value: r.value, label: t(r.label) }))} />

    <div className="sa-grid" data-tour="stats-main">
      <div className="sa-tile">
        <span className="l">{t('Sessions')}</span>
        <div className="sa-ringrow">
          <Ring done={adh.done} planned={adh.planned} />
          <div><b className="sa-v">{adh.done}{adh.planned > 0 && <small> / {adh.planned}</small>}</b>
            <span className="s">{adh.planned > 0 ? t('days planned') : t('days trained')}</span></div>
        </div>
      </div>

      <button className="sa-tile" onClick={() => calendarSheet()}>
        <span className="l">{t('Streak')}</span>
        <b className="sa-v">{streak}<small> {t(streak === 1 ? 'week' : 'weeks')}</small></b>
        <div className="sa-strip" aria-label={t('Last {0} weeks', STRIP_WEEKS)}>{strip.map(w => <i key={w.wk} className={w.on ? 'on' : ''} />)}</div>
      </button>

      <div className="sa-tile">
        <span className="l">{t('Volume')} <Delta pct={prevVol > 0 ? (vol - prevVol) / prevVol : null} /></span>
        <b className="sa-v">{fmtNum(Math.round(vol))}<small> {S.unit}</small></b>
        <div className="sa-bars">{bk.map(x => <i key={x.key} style={{ height: maxVol ? Math.max(8, x.vol / maxVol * 100) + '%' : '8%' }} className={x.vol ? 'on' : ''} />)}</div>
      </div>

      <div className="sa-tile">
        <span className="l">{t('Time')}</span>
        <b className="sa-v">{mins ? fmtDur(mins * 60000) : '—'}</b>
        <Spark values={mins ? bk.map(x => x.min) : []} h={30} />
      </div>
    </div>

    {S.workouts.length > 0 && <LiftsToWatch S={S} />}
    <MuscleBalance S={S} ws={ws} b={b} />
    <MainLifts S={S} />
    {S.workouts.length > 0 && <WeekPattern S={S} b={b} ws={ws} />}

    <div className="sa-pair">
      <button className="sa-tile" onClick={() => bwSheet()}>
        <span className="l">{t('Body weight')}</span>
        <b className="sa-v">{bw ? <>{fmtNum(bw.w)}<small> {S.unit}</small></> : '—'}</b>
        <Spark values={bwSeries} goal={S.targetW || null} h={40} />
        <span className="s">{paceLine || (bw ? fmtDate(bw.d, true) : t('Tap to log'))}</span>
        {goalLine && <span className={'s ' + (pace && pace.dir === 'away' ? 'warn' : pace && pace.dir === 'toward' ? 'good' : '')}>{goalLine}</span>}
      </button>

      <button className="sa-tile dark" onClick={() => lift && nav('/exercise/' + lift.id)} disabled={!lift}>
        <span className="l"><span className="nm">{lift ? nameOf(lift.id) : t('Strength')}</span><span className="k">· {t('est. 1RM')}</span></span>
        <b className="sa-v">{lift ? <>{fmtNum(lift.now)}<small> {S.unit}</small></> : '—'}</b>
        <Spark values={lift ? lift.pts.map(p => p.y) : []} color="var(--acc)" h={40} />
        <span className="s acc">{!lift ? t('Log a weighted set') : lift.delta == null ? t('One session so far') : Math.abs(lift.delta) < 0.05 ? t('No change since {0}', fmtDate(lift.since)) : t('{0} since {1}', (lift.delta > 0 ? '+' : '−') + fmtVol(Math.abs(lift.delta), S.unit), fmtDate(lift.since))}</span>
      </button>
    </div>

    <div className="card sa-card">
      <div className="pk-card-h"><b>{t('Personal bests')}</b><span>{prs.length} {inLabel(days)}</span></div>
      {prs.length ? prs.slice(0, 5).map((p, i) => (
        <button key={p.d + p.id + i} className="sa-pb" onClick={() => nav('/exercise/' + p.id)}>
          <span className="ic"><Icon name="trophy" /></span>
          <span className="l"><b>{nameOf(p.id)}</b><span>{t(p.bw ? 'Added weight' : 'Weight')} · {dayLabel(p.d)}</span></span>
          <span className="v">{(p.bw ? '+' : '') + fmtNum(p.w) + ' ' + S.unit} × {p.r}</span>
        </button>
      )) : <div className="muted small" style={{ marginTop: 10 }}>{t('No new records {0}.', inLabel(days))}</div>}
    </div>
  </>
}
