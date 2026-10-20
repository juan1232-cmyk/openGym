import { useRef, useState } from 'react'
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

// What Peek says about each fix, in the order to try them (stats.js fixesFor) — the order is
// the advice, so the lines read as one train of thought: the first says "you should", the rest
// "or…", and a deload that leads says why (missing the target over and over, or sliding),
// where one at the end is the last resort. `act` is what accepting it would change
// (lib/liftfix.js), which lets the line name the actual numbers.
const pctOff = f => Math.round((1 - f.factor) * 100)
const where = act => (act.routines.length === 1 ? act.routines[0].name : t('{0} routines', act.routines.length))
const shortDate = iso => new Date(iso + 'T12:00:00').toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short' })
function fixSay(f, act, S, x, first) {
  if (f.kind === 'sets') return act && act.routines.length === 1
    ? t('You should add a set: {0} → {1} in {2}.', act.routines[0].from, act.routines[0].to, act.routines[0].name)
    : act ? t('You should add a set to it, everywhere it’s planned.') : t('You should add {0}–{1} sets to it this week.', f.add[0], f.add[1])
  if (f.kind === 'swap') return !f.alt ? t('Or try a similar exercise for a session.')
    : first ? t('Swap in {0} for your next session.', nameOf(f.alt)) : t('Or swap in {0} for your next session.', nameOf(f.alt))
  const why = !first ? t('Still stuck?')
    : x.kind === 'stuck' ? t('{0} misses in a row says the weight’s too heavy right now.', x.n)
      : t('It’s sliding, and that’s usually tiredness, not lost strength.')
  return why + ' ' + (f.weight != null
    ? t('Take a deload week at {0} ({1} % lighter).', fmtNum(f.weight) + ' ' + S.unit, pctOff(f))
    : t('Take a deload week, about {0} % lighter.', pctOff(f)))
}
const FIX_BUTTON = { sets: 'Add set', swap: 'Swap', deload: 'Deload' }
function fixDoneLine(m, S, pending) {
  if (m.kind === 'sets') return m.routines.length === 1 ? t('Added a set: {0} → {1}.', m.routines[0].from, m.routines[0].to) : t('Added a set in {0}.', where(m))
  if (m.kind === 'swap') return pending ? t('Next session: {0} instead.', nameOf(m.to)) : t('Swapped in {0} for a session.', nameOf(m.to))
  return t('Deload week: {0} until {1}.', fmtNum(m.w) + ' ' + S.unit, shortDate(m.until))
}
function fixToast(act, id, S) {
  if (act.kind === 'sets') return t('One more set of {0} from now on', nameOf(id))
  if (act.kind === 'swap') return t('Next session: {0} instead', nameOf(act.to))
  return t('Deload week set: {0}', fmtNum(act.w) + ' ' + S.unit)
}
// Whether an accepted fix can still be taken back: a swap only until its session happens, a
// deload only while its week lasts. Added sets always can.
const undoable = (S, id, m) => (m.kind === 'swap' ? swapPending(S, id) : m.kind === 'deload' ? m.until >= todayISO() : true)

// Peek's take on one lift: each fix as a line with its own button — one tap does it, no
// "are you sure", since every one of them can be undone right there. Then the line turns into
// what was done. A fix with nothing to change (a lift you only do freestyle, a bodyweight
// lift's deload) is still said, just without a button.
// Only one lift's take is open at a time (`open`); the rest are a single line until tapped,
// so three stalled lifts read as one coach talking, not a wall of advice.
function PeekFixes({ S, x, open, onOpen }) {
  const orb = useRef(null)
  const update = useStore(s => s.update)
  if (!open) {
    const left = x.fixes.filter(f => !fixDone(S, x.id, f.kind)).length
    return <div className="sa-peek">
      <Orb size={30} mood="curious" poke="joyful-wide" />
      <div className="sa-say"><button className="sa-sug" onClick={onOpen}>
        <span>{left ? t(left === 1 ? 'I’ve got one more idea for this one.' : 'I’ve got {0} ideas for this one.', left) : t('On it. Let’s see if it moves.')}</span><Icon name="chevronDown" />
      </button></div>
    </div>
  }
  const accept = f => {
    let act = null
    update(s => { act = applyFix(s, x.id, f) })
    if (!act) return
    orb.current?.react('joyful-wide', 900)
    orb.current?.bump('nod')
    toast(fixToast(act, x.id, S))
  }
  const undo = kind => { update(s => { undoFix(s, x.id, kind) }); toast(t('Undone')) }
  return <div className="sa-peek">
    <Orb ref={orb} size={30} mood="curious" poke="joyful-wide" />
    <div className="sa-say">{x.fixes.map((f, i) => {
      const done = fixDone(S, x.id, f.kind)
      if (done) return <div key={f.kind} className="sa-sug done">
        <Icon name="check" /><span>{fixDoneLine(done, S, swapPending(S, x.id))}</span>
        {undoable(S, x.id, done) && <button className="undo" onClick={() => undo(f.kind)}>{t('Undo')}</button>}
      </div>
      const act = fixAction(S, x.id, f)
      return <div key={f.kind} className={'sa-sug' + (act ? '' : ' off')}>
        <span>{fixSay(f, act, S, x, i === 0)}</span>
        {act && <Button size="sm" variant="tinted" onClick={() => accept(f)}>{t(FIX_BUTTON[f.kind])}</Button>}
      </div>
    })}</div>
  </div>
}

// Lifts to act on now — stuck on their target, with an estimate that's falling, or with no
// new estimated best in a while (and what Peek would do about it).
function LiftsToWatch({ S }) {
  const nav = useNavigate()
  const list = liftsToWatch(S).slice(0, 4)
  const [pick, setPick] = useState(null)
  // the one you tapped open, else the first lift Peek still has something to suggest for
  const pending = x => x.fixes.some(f => !fixDone(S, x.id, f.kind))
  const open = (list.find(x => x.id === pick) || list.find(pending) || list[0] || {}).id
  return <div className="card sa-card">
    <div className="pk-card-h"><b>{t('Lifts to watch')}</b><span>{t('Right now')}</span></div>
    {list.length ? list.map(x => <div key={x.id} className="sa-watch">
      <button className="sa-pb" onClick={() => nav('/exercise/' + x.id + '?tab=history')}>
        <span className={'ic ' + x.kind}><Icon name={x.kind === 'stuck' ? 'pause' : x.kind === 'flat' ? 'minus' : 'arrowDown'} /></span>
        <span className="l"><b>{nameOf(x.id)}</b><span>{x.kind === 'stuck'
          ? t('Missed the target {0} sessions in a row', x.n)
          : x.kind === 'flat'
            ? t('No new est. 1RM best in {0} sessions', x.n)
            : t('Est. 1RM down {0} per 2 weeks', fmtVol(Math.abs(x.rate), S.unit))}</span>
        </span>
        <Icon name="chevronRight" className="chev" />
      </button>
      {x.fixes.length > 0 && <PeekFixes S={S} x={x} open={x.id === open} onOpen={() => setPick(x.id)} />}
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
