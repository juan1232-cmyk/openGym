// One exercise, as its own screen, laid out like Hevy's: a header with ‹ and Add, then three
// tabs — Summary (the picture, what it trains, a chart and the records), History (the Peek
// progress card, the coach line, the 1RM calculator and every session drawn as bars) and How to.
// It replaced both the details sheet and the separate progress page (views/ExerciseProgress),
// which said half the same things in two places.
import { useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { EXIDX, isCardio } from '../lib/exercises.js'
import { primaryOf, secondaryOf } from '../lib/pick.js'
import { MUSCLE_NAME } from '../lib/muscles.js'
import { fmtDate, fmtNum, todayISO } from '../lib/format.js'
import { exerciseSessions, exerciseRecords, exerciseMetrics, prSets, sessionTops } from '../lib/exercise-records.js'
import { setLabel, fmtSec } from '../lib/history.js'
import { estimate1RM, best1RM, e1rmSeries, REP_CAP } from '../lib/onerm.js'
import { progressSeries, trendPer14 } from '../lib/progress.js'
import { nextPrescription } from '../lib/progression.js'
import { liftTrend, liftStalls, STALL_SESSIONS } from '../lib/verdict.js'
import { t, instrFor, getLang, INSTR_LANGS } from '../lib/i18n.js'
import { addToRoutineSheet, customExSheet } from '../sheets.jsx'
import LineChart from '../components/LineChart.jsx'
import Media from '../components/Media.jsx'
import Stepper from '../components/Stepper.jsx'
import Icon from '../components/Icon.jsx'
import Orb from '../components/Orb.jsx'
import { Button } from '../components/ui.jsx'

/* ============================ Summary ============================ */

// Primary and supporting muscles plus the kit, as plain grey lines under the name.
function Targets({ ex }) {
  const p = primaryOf(ex), sec = secondaryOf(ex)
  const kit = ex.eq && ex.eq !== 'custom' ? t(ex.eq) : null
  if (!p && !kit) return null
  const line = (k, v) => <div>{t(k)}: <span>{v}</span></div>
  return <div className="dt-targets">
    {p && line('Primary', t(MUSCLE_NAME[p]))}
    {sec.length > 0 && line('Secondary', sec.map(m => t(MUSCLE_NAME[m])).join(', '))}
    {kit && line('Equipment', kit)}
  </div>
}

// One line of the records list: what it is, and when, on the left; the number on the right.
const RecRow = ({ label, d, icon, children }) => <div className="dt-rec">
  {icon && <span className="dt-rec-i"><Icon name={icon} /></span>}
  <span className="dt-rec-l">{label}{d && <small>{fmtDate(d, true)}</small>}</span><b>{children}</b>
</div>

// What each chip on the chart plots, and how its number reads. 'onerm' is not in
// exerciseMetrics, which stays free of imports: it comes from the 1RM estimate.
const METRICS = [
  { key: 'weight', label: 'Heaviest weight', fmt: (v, u) => fmtNum(v) + ' ' + u },
  { key: 'onerm', label: 'One rep max', fmt: (v, u) => fmtNum(v) + ' ' + u },
  { key: 'setVol', label: 'Best set volume', fmt: (v, u) => fmtNum(v) + ' ' + u },
  { key: 'sessionVol', label: 'Session volume', fmt: (v, u) => fmtNum(v) + ' ' + u },
  { key: 'reps', label: 'Most reps', fmt: v => t('{0} reps', fmtNum(v)) },
  { key: 'sessionReps', label: 'Session reps', fmt: v => t('{0} reps', fmtNum(v)) },
  { key: 'hold', label: 'Longest hold', fmt: v => fmtSec(v) },
  { key: 'speed', label: 'Top speed', fmt: v => fmtNum(v) + ' km/h' },
  { key: 'min', label: 'Longest time', fmt: v => fmtNum(v) + ' min' }
]
const RANGES = [{ value: 90, label: 'Last 3 months' }, { value: 365, label: 'Last year' }, { value: 0, label: 'All time' }]

// The trend line with a headline above it (the latest value and its date) and a chip per measure
// the log has. The range looks back from today, as Hevy's does.
function Trend({ ex }) {
  const st = useStore(s => s.S)
  const [key, setKey] = useState('')
  const [days, setDays] = useState(90)
  const [scrub, setScrub] = useState(null)   // the session under the finger, else the latest
  const series = exerciseMetrics(st, ex.id)
  const e1 = e1rmSeries(st, ex.id)
  if (e1.length) series.onerm = e1.map(p => ({ t: p.t, d: p.d, y: p.y }))
  const chips = METRICS.filter(m => series[m.key])
  if (!chips.length) return <div className="dt-empty"><Icon name="chartLine" />{t('Log this exercise in a workout to see its progress here.')}</div>
  const m = chips.find(c => c.key === key) || chips[0]
  const since = days ? Date.now() - days * 864e5 : 0
  const pts = series[m.key].filter(p => p.t >= since)
  // matched by time: the series is rebuilt every render, so the scrubbed object is a stale copy
  const held = scrub && pts.find(p => p.t === scrub.t)
  const last = held || pts[pts.length - 1]
  return <>
    <div className="dt-head">
      <div>{last ? <><b>{m.fmt(last.y, st.unit)}</b><span>{fmtDate(last.d, !!held)}</span></> : <span>{t('Nothing in this range')}</span>}</div>
      <select className="dt-range" value={days} onChange={e => { setDays(+e.target.value); setScrub(null) }} aria-label={t('Range')}>
        {RANGES.map(r => <option key={r.value} value={r.value}>{t(r.label)}</option>)}
      </select>
    </div>
    {pts.length > 0 && <div className="dt-chart"><LineChart points={pts} h={180} onScrub={setScrub} /></div>}
    {pts.length > 1 && <div className="dt-hint">{t('Drag across the chart to see each session')}</div>}
    <div className="chips dt-chips">
      {chips.map(c => <button key={c.key} className={'chip nocap' + (c.key === m.key ? ' on' : '')} onClick={() => { setKey(c.key); setScrub(null) }}>{t(c.label)}</button>)}
    </div>
  </>
}

// The four records Hevy leads with — heaviest weight, best 1RM, best set volume, best session
// volume — or, for what has no weight, the reps, hold or speed equivalents.
function Records({ ex }) {
  const st = useStore(s => s.S)
  const u = st.unit
  const rec = exerciseRecords(st, ex.id)
  const oneRM = best1RM(st, ex.id)
  const loaded = !!rec.heaviest
  const rows = [
    loaded && <RecRow key="h" icon="dumbbell" label={t('Heaviest weight')} d={rec.heaviest.d}>{fmtNum(rec.heaviest.w)} {u}</RecRow>,
    oneRM && <RecRow key="1" icon="trophy" label={t('Best 1RM')} d={oneRM.d}>{fmtNum(oneRM.est)} {u}</RecRow>,
    rec.bestSet && <RecRow key="s" icon="flame" label={t('Best set volume')} d={rec.bestSet.d}>{fmtNum(rec.bestSet.w)} {u} × {rec.bestSet.r}</RecRow>,
    rec.bestSession && <RecRow key="v" icon="chart" label={t('Best session volume')} d={rec.bestSession.d}>{fmtNum(rec.bestSession.vol)} {u}</RecRow>,
    !loaded && rec.mostReps && <RecRow key="r" icon="trophy" label={t('Most reps in a set')} d={rec.mostReps.d}>{t('{0} reps', rec.mostReps.r)}</RecRow>,
    !loaded && rec.mostSessionReps && <RecRow key="sr" icon="chart" label={t('Most reps in a session')} d={rec.mostSessionReps.d}>{t('{0} reps', rec.mostSessionReps.r)}</RecRow>,
    rec.longestHold && <RecRow key="t" icon="clock" label={t('Longest hold')} d={rec.longestHold.d}>{fmtSec(rec.longestHold.sec)}</RecRow>,
    rec.topSpeed && <RecRow key="sp" icon="figureRun" label={t('Top speed')} d={rec.topSpeed.d}>{fmtNum(rec.topSpeed.speed)} km/h</RecRow>,
    rec.longestMin && <RecRow key="m" icon="clock" label={t('Longest time')} d={rec.longestMin.d}>{rec.longestMin.min} min</RecRow>
  ].filter(Boolean)
  if (!rows.length) return null
  return <>
    <h4 className="sec">{t('Personal records')}</h4>
    <div className="dt-recs">{rows}</div>
  </>
}

function Summary({ ex }) {
  return <>
    <Media ex={ex} />
    <h2 className="capitalize dt-name">{ex.n}</h2>
    <Targets ex={ex} />
    {ex.desc && <div className="exnote">{ex.desc}</div>}
    <Trend ex={ex} />
    <Records ex={ex} />
  </>
}

/* ============================ History ============================ */

const PROGRESS_MOOD = { progressing: 'proud', holding: 'idle', slipping: 'disappointed', stalled: 'suspicious' }
const LABEL = { e1rm: 'Estimated 1 rep max', weight: 'Heaviest set', reps: 'Most reps', sec: 'Longest hold', speed: 'Top speed' }
const SHOWN = 10   // sessions on the chart — enough for a trend, few enough to read each step

// The Peek design's chart: a bare line with the session in the headline as a green dot — no
// axes, no gridlines, dates only at the two ends. The numbers live in the headline, so on a
// phone you drag a finger along the line and the headline follows it (onScrub gets the
// session's index, null on letting go). touch-action pan-y keeps a vertical swipe scrolling.
function Spark({ points, at, onScrub }) {
  const W = 342, H = 120, P = 8
  const ref = useRef(null)
  const ts = points.map(p => p.t), ys = points.map(p => p.y)
  const t0 = Math.min(...ts), t1 = Math.max(...ts), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const xy = p => [
    t1 > t0 ? P + (p.t - t0) / (t1 - t0) * (W - 2 * P) : W / 2,
    y1 > y0 ? H - P - (p.y - y0) / (y1 - y0) * (H - 2 * P) : H / 2
  ]
  const xs = points.map(p => xy(p)[0])
  const move = e => {
    const c = e.touches ? e.touches[0] : e
    if (!c || c.clientX === undefined) return
    const r = ref.current.getBoundingClientRect()
    const vx = (c.clientX - r.left) / (r.width || W) * W
    let i = 0
    xs.forEach((x, k) => { if (Math.abs(x - vx) < Math.abs(xs[i] - vx)) i = k })
    if (i !== at) onScrub(i)
  }
  const end = () => onScrub(null)
  const cur = at == null ? points.length - 1 : at
  const [lx, ly] = xy(points[cur])
  return <div className="pk-spark-i" onMouseMove={move} onMouseDown={move} onMouseLeave={end}
    onTouchStart={move} onTouchMove={move} onTouchEnd={end} onTouchCancel={end}>
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="pk-spark" aria-hidden="true">
      {at != null && <line x1={lx} x2={lx} y1="0" y2={H} stroke="var(--label-3)" strokeWidth="1" strokeDasharray="3 3" />}
      {points.length > 1 && <polyline points={points.map(p => xy(p).join(',')).join(' ')} fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
      {points.map((p, k) => k === cur ? null : <circle key={k} cx={xs[k]} cy={xy(p)[1]} r="2.6" fill="var(--ink)" />)}
      <circle cx={lx} cy={ly} r="7" fill="var(--acc)" stroke="var(--surface)" strokeWidth="2" />
    </svg>
  </div>
}

// The headline number (estimated 1RM where the log supports one), how far it moved over the
// last ten sessions, the line, and the orb's read of the lift with what to try next time.
function ProgressCard({ ex }) {
  const S = useStore(s => s.S)
  const [at, setAt] = useState(null)   // the session under the finger, else the latest
  const id = ex.id, unit = S.unit
  const { kind, points, top, rows } = progressSeries(S, id)
  const shown = points.slice(-SHOWN)
  const latest = shown[shown.length - 1]
  if (!latest) return null
  const cur = at != null && shown[at] ? shown[at] : latest
  const first = shown[0]
  const fmtY = y => kind === 'sec' ? fmtSec(y) : kind === 'reps' ? t('{0} reps', fmtNum(y)) : kind === 'speed' ? fmtNum(y) + ' km/h' : fmtNum(y) + ' ' + unit
  const delta = shown.length > 1 ? Math.round((cur.y - first.y) * 10) / 10 : null

  // The coach line: the trend in weight actually on the bar, then what the progression engine
  // will prescribe next time — the same call the next session will make, so the two agree.
  const routine = S.routines.find(r => r.ex.some(e => e.id === id))
  const lastRow = rows[rows.length - 1]
  const next = nextPrescription(S, routine ? routine.ex.find(e => e.id === id) : { ...(lastRow.target || {}), id }, routine)
  const rate = trendPer14(top.slice(-8))
  const step = rate == null ? null : Math.round(Math.abs(rate) * 2) / 2
  // The orb's own read of this lift — the same call Home's verdict makes, so the two agree.
  const trend = liftTrend(S, id)
  const stuck = routine && liftStalls(S, routine.ex.find(e => e.id === id)) >= STALL_SESSIONS
  const verdict = stuck ? 'stalled' : trend ? { up: 'progressing', flat: 'holding', down: 'slipping' }[trend.dir] : null
  const tip = [
    rate == null ? null
      : step < 0.5 ? (trend && trend.dir === 'up' ? t("Same weight, more reps. That's progress.") : t('Holding steady at this weight lately.'))
        : rate > 0 ? t("You've added about {0} every two weeks.", fmtNum(step) + ' ' + unit)
          : t('Down about {0} every two weeks lately.', fmtNum(step) + ' ' + unit),
    // a deload says why (it's the surprising one); otherwise the number is the useful part
    !next || next.kind === 'off' ? null
      : next.weight > 0 && next.kind !== 'deload' ? t('Try {0} next time.', fmtNum(next.weight) + ' ' + unit)
        : next.why ? t(...next.why) : null
  ].filter(Boolean).join(' ')

  return <>
    <div className="card pk-pcard">
      <span className="lbl">{t(LABEL[kind])}{cur !== latest && <> · <b className="pk-at">{fmtDate(cur.d, true)}</b></>}</span>
      <div className="big">
        <b>{fmtY(cur.y)}</b>
        {delta != null && delta !== 0 && <span className={'pill' + (delta > 0 ? ' up' : '')}>{delta > 0 ? '+' : '−'}{fmtY(Math.abs(delta))}</span>}
      </div>
      <Spark points={shown} at={at} onScrub={setAt} />
      <div className="axis"><span>{fmtDate(first.d)}</span><span>{latest.d === todayISO() ? t('Today') : fmtDate(latest.d)}</span></div>
      {shown.length > 1 && <div className="dt-hint">{t('Drag across the line to see each session')}</div>}
    </div>
    {tip && <div className="pk-coach"><Orb size={44} inverted mood={PROGRESS_MOOD[verdict]} verdict={verdict} poke="joyful-wide" /><p>{tip}</p></div>}
  </>
}

// Estimated 1RM (issue #18): what the log already implies, plus a calculator for a set you
// have not done — so the number is reachable before there is any history.
function OneRM({ ex }) {
  const st = useStore(s => s.S)
  const best = best1RM(st, ex.id)
  const [w, setW] = useState(best ? best.w : (st.exWeights[ex.id] || {}).w || 20)
  const [r, setR] = useState(best ? best.r : 5)
  const est = estimate1RM(w, r)
  return <div className="card dt-1rm">
    <div className="pk-card-h"><b>{t('Estimated 1RM')}</b><span>{t('Epley')}</span></div>
    {best && <div className="small" style={{ margin: '6px 0 12px' }}>
      {t('From your log:')} <b className="accent">{fmtNum(best.est)} {st.unit}</b>
      <span className="dim"> · {t('{0} × {1} on {2}', fmtNum(best.w) + ' ' + st.unit, best.r, fmtDate(best.d, true))}
        {/* the estimate counted the reps left in the tank, so say so — otherwise 60 × 8
            "giving" 80 reads like a wrong sum */}
        {best.rir != null && ' · ' + t('{0} in reserve', fmtNum(best.rir))}</span>
    </div>}
    <div className="row cfgrow" style={{ margin: '10px 0' }}>
      <Stepper label={t('Weight ({0})', st.unit)} value={w} step={2.5} onChange={setW} />
      <Stepper label={t('Reps')} value={r} step={1} decimal={false} onChange={setR} />
    </div>
    <div className="row between" style={{ marginBottom: 4 }}>
      <span className="muted small">{t('Estimate')}</span>
      <b className="accent" style={{ fontSize: 22 }}>{est === null ? '—' : fmtNum(est) + ' ' + st.unit}</b>
    </div>
    <div className="small dim">{est === null
      ? t('Enter a weight and 1–{0} reps — beyond that an estimate is guesswork.', REP_CAP)
      : t('Epley formula — a calculation from one set, not a tested max.')}</div>
  </div>
}

// How big a set was, on one scale per exercise, to tell a PR: the 1RM it implies for a lift,
// else the reps, hold or minutes.
const setSize = s => (s.w > 0 ? estimate1RM(s.w, s.r) || s.w : s.r || s.sec || s.min || 0)

// How a session's top set moved from the one before, in its own unit: "+2.5 kg", "Same", "−2 reps".
const DELTA_UNIT = { w: u => ' ' + u, r: () => ' reps', sec: () => ' s', min: () => ' min' }
const fmtDelta = (top, unit) => top.delta == null ? null : top.delta === 0 ? t('Same')
  : (top.delta > 0 ? '+' : '−') + fmtNum(Math.abs(top.delta)) + DELTA_UNIT[top.field](unit)

// The last sessions as a timeline (design D): each one a line — the day and workout, its top set,
// how that moved from the session before, a PR badge if one fell — that opens to show every set.
// It is a glance, not a log, so only the newest starts open.
const SESSIONS_AT_A_TIME = 10
function Sessions({ ex }) {
  const st = useStore(s => s.S)
  const [shown, setShown] = useState(SESSIONS_AT_A_TIME)
  const [open, setOpen] = useState(0)   // index of the open session, -1 for none
  const sessions = exerciseSessions(st, ex.id)
  if (!sessions.length) return <div className="dt-empty"><Icon name="clock" />{t('No sessions yet — once you log this exercise, they show up here.')}</div>
  const prs = prSets(sessions, setSize)
  const tops = sessionTops(sessions, setSize)
  const list = sessions.slice(0, shown)
  return <>
    <h4 className="sec">{t('Last sessions')}</h4>
    <div className="dt-tl">
      {list.map((s, k) => {
        const top = tops[k], d = fmtDelta(top, st.unit), isOpen = open === k
        return <div key={s.id} className={'dt-tl-item' + (k === 0 ? ' now' : '') + (k === list.length - 1 ? ' last' : '')}>
          <button className="dt-tl-h" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? -1 : k)}>
            <span className="dt-tl-t">
              <small>{fmtDate(s.d, true)} · {s.name || t('Workout')}</small>
              <span className="dt-tl-v">
                <b>{top.field === 'w' ? fmtNum(top.value) + ' ' + st.unit : setLabel(ex.id, top.set, s.target)}</b>
                {d && <span className={'dt-chg' + (top.delta > 0 ? ' up' : '')}>{d}</span>}
                {prs[k].some(Boolean) && <span className="dt-pr"><Icon name="trophy" />PR</span>}
              </span>
            </span>
            <Icon name="chevronDown" className={'dt-tl-chev' + (isOpen ? ' on' : '')} />
          </button>
          {isOpen && <div className="dt-tl-sets">
            {s.sets.map((x, i) => <div key={i} className="dt-set">
              <i>{i + 1}</i>
              <span className="lbl">{setLabel(ex.id, x, s.target)}</span>
              {prs[k][i] && <span className="dt-pr"><Icon name="trophy" />PR</span>}
            </div>)}
          </div>}
        </div>
      })}
    </div>
    {sessions.length > shown && <Button variant="soft" onClick={() => setShown(n => n + SESSIONS_AT_A_TIME)}>{t('Show more')}</Button>}
  </>
}

function HistoryTab({ ex }) {
  return <>
    <ProgressCard ex={ex} />
    {!isCardio(ex) && <OneRM ex={ex} />}
    <Sessions ex={ex} />
  </>
}

/* ============================ How to ============================ */

function HowTo({ ex }) {
  const steps = instrFor(ex)
  return <>
    <Media ex={ex} />
    <h2 className="capitalize dt-name">{ex.n}</h2>
    {steps.length > 0
      ? <>
        {!INSTR_LANGS.includes(getLang()) && <div className="small dim" style={{ marginBottom: 8 }}>{t('instructions in English')}</div>}
        <ol className="dt-steps">{steps.map((s, i) => <li key={i}><b>{i + 1}.</b><span>{s}</span></li>)}</ol>
      </>
      : <div className="dt-empty"><Icon name="info" />{ex.desc || t('No instructions for this exercise.')}</div>}
  </>
}

/* ============================ the screen ============================ */

const TABS = [['summary', 'Summary'], ['history', 'History'], ['howto', 'How to']]

// The header and tab bar stay pinned while the tab scrolls under them. Add (to a plan) sits in
// the header, one tap from anywhere on the screen; a custom exercise gets its pencil beside it.
export function ExerciseScreen({ ex, onBack, tab: tab0 = 'summary' }) {
  const [tab, setTab] = useState(TABS.some(([k]) => k === tab0) ? tab0 : 'summary')
  const root = useRef(null)
  // back to the top of the new tab — the page's, or the full-screen sheet's when it is one
  const pick = k => { setTab(k); (root.current?.closest('.fullsheet') || window).scrollTo(0, 0) }
  return <div className="exs" ref={root}>
    <div className="exs-top">
      <div className="exs-bar">
        <button className="pk-back" onClick={onBack} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
        <h1 className="capitalize">{ex.n}</h1>
        {ex.custom && <button className="exs-icon" onClick={() => customExSheet(ex)} aria-label={t('Edit')}><Icon name="pencil" /></button>}
        <button className="exs-add" onClick={() => addToRoutineSheet(ex)}><Icon name="plus" />{t('Add')}</button>
      </div>
      <div className="dt-tabs" role="tablist">
        {TABS.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => pick(k)}>{t(label)}</button>)}
      </div>
    </div>
    <div className="exs-body">
      {tab === 'summary' && <Summary ex={ex} />}
      {tab === 'history' && <HistoryTab ex={ex} />}
      {tab === 'howto' && <HowTo ex={ex} />}
    </div>
  </div>
}

// The route, #/exercise/:id — ?tab=history opens straight on the progress (what Stats links to).
export default function ExerciseRoute() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const loc = useLocation()
  useStore(s => s.S.customEx)   // a renamed or deleted custom exercise re-reads EXIDX
  const ex = EXIDX[id]
  if (!ex) return <Navigate to="/library" replace />
  // a deep link has nothing to go back to; everything else returns to where it came from
  const back = () => (loc.key === 'default' ? nav('/library') : nav(-1))
  return <ExerciseScreen key={id} ex={ex} onBack={back} tab={params.get('tab') || 'summary'} />
}
