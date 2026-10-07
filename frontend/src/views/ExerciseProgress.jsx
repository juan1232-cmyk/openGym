import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { EXIDX } from '../lib/exercises.js'
import { fmtNum, fmtDate, todayISO } from '../lib/format.js'
import { fmtSec, setLabel } from '../lib/history.js'
import { progressSeries, trendPer14 } from '../lib/progress.js'
import { nextPrescription } from '../lib/progression.js'
import { liftTrend, liftStalls, STALL_SESSIONS } from '../lib/verdict.js'
import { t } from '../lib/i18n.js'
import { exerciseDetailSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import Orb from '../components/Orb.jsx'
import { Button } from '../components/ui.jsx'

const PROGRESS_MOOD = { progressing: 'proud', holding: 'idle', slipping: 'disappointed', stalled: 'suspicious' }
const LABEL = { e1rm: 'Estimated 1 rep max', weight: 'Heaviest set', reps: 'Most reps', sec: 'Longest hold', speed: 'Top speed' }
const SHOWN = 10   // sessions on the chart — enough for a trend, few enough to read each step

// The design's chart is a bare line with the latest session as a green dot: no axes, no
// gridlines, dates only at the two ends. The numbers live in the headline and the list below.
function Spark({ points }) {
  const W = 342, H = 110, P = 6
  const ts = points.map(p => p.t), ys = points.map(p => p.y)
  const t0 = Math.min(...ts), t1 = Math.max(...ts), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const xy = p => [
    t1 > t0 ? P + (p.t - t0) / (t1 - t0) * (W - 2 * P) : W / 2,
    y1 > y0 ? H - P - (p.y - y0) / (y1 - y0) * (H - 2 * P) : H / 2
  ]
  const [lx, ly] = xy(points[points.length - 1])
  return <svg viewBox={`0 0 ${W} ${H}`} className="pk-spark" aria-hidden="true">
    {points.length > 1 && <polyline points={points.map(p => xy(p).join(',')).join(' ')} fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
    <circle cx={lx} cy={ly} r="6" fill="var(--acc)" stroke="#fff" strokeWidth="2" />
  </svg>
}

// D7 from the Peek design: one exercise's progress — the headline number and how far it has
// moved, a trend line, a coach line, and every session. Reached from the exercise details sheet
// (in the library or mid-workout) and from Stats.
export default function ExerciseProgress() {
  const { id } = useParams()
  const nav = useNavigate()
  const loc = useLocation()
  const S = useStore(s => s.S)
  const ex = EXIDX[id]
  if (!ex) return <Navigate to="/stats" replace />
  const unit = S.unit
  // a deep link has nothing to go back to; everything else returns to where it came from
  const back = () => (loc.key === 'default' ? nav('/stats') : nav(-1))

  const { kind, points, top, rows } = progressSeries(S, id)
  const fmtY = y => kind === 'sec' ? fmtSec(y) : kind === 'reps' ? t('{0} reps', fmtNum(y)) : kind === 'speed' ? fmtNum(y) + ' km/h' : fmtNum(y) + ' ' + unit
  const shown = points.slice(-SHOWN)
  const cur = shown[shown.length - 1]
  const first = shown[0]
  const delta = shown.length > 1 ? Math.round((cur.y - first.y) * 10) / 10 : null

  // The coach line: the trend in weight actually on the bar, then what the progression engine
  // will prescribe next time — the same call the next session will make, so the two agree.
  const routine = S.routines.find(r => r.ex.some(e => e.id === id))
  const lastRow = rows[rows.length - 1]
  const next = rows.length ? nextPrescription(S, routine ? routine.ex.find(e => e.id === id) : { ...(lastRow.target || {}), id }, routine) : null
  const rate = trendPer14(top.slice(-8))
  const step = rate == null ? null : Math.round(Math.abs(rate) * 2) / 2
  // The orb's own read of this lift — the same call Home's verdict makes, so the two agree.
  // It goes by the estimated 1RM, which is why the bar weight can hold while the orb is pleased.
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

  const row = r => {
    const ws = r.sets.map(s => s.w || 0)
    const sameLoad = (kind === 'e1rm' || kind === 'weight') && ws.every(w => w === ws[0])
    return <div key={r.d + r.t} className="pk-row">
      <span className="l">
        <b>{fmtDate(r.d, true)}</b>
        <span>{sameLoad ? t('{0} reps', r.sets.map(s => s.r || 0).join(', ')) : r.sets.map(s => setLabel(id, s, r.target)).join('  ')}</span>
      </span>
      <span className="v">{sameLoad || kind === 'e1rm' || kind === 'weight' ? fmtNum(Math.max(...ws)) + ' ' + unit
        : fmtY(Math.max(...r.sets.map(s => (kind === 'sec' ? s.sec : kind === 'speed' ? s.speed : s.r) || 0)))}</span>
    </div>
  }

  return <div className="narrow pk-prog">
    <div className="pk-ptop">
      <button className="pk-back" onClick={back} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <h1 className="capitalize">{ex.n}</h1>
    </div>
    {cur ? <>
      <div className="card pk-pcard">
        <span className="lbl">{t(LABEL[kind])}</span>
        <div className="big">
          <b>{fmtY(cur.y)}</b>
          {delta != null && delta !== 0 && <span className={'pill' + (delta > 0 ? ' up' : '')}>{delta > 0 ? '+' : '−'}{fmtY(Math.abs(delta))}</span>}
        </div>
        <Spark points={shown} />
        <div className="axis"><span>{fmtDate(first.d)}</span><span>{cur.d === todayISO() ? t('Today') : fmtDate(cur.d)}</span></div>
      </div>
      {tip && <div className="pk-coach"><Orb size={44} inverted mood={PROGRESS_MOOD[verdict]} verdict={verdict} poke="joyful-wide" /><p>{tip}</p></div>}
      <div className="card pk-list">
        <div className="pk-card-h"><b>{t('Sessions')}</b></div>
        {rows.slice(-12).reverse().map(row)}
      </div>
    </> : <div className="empty"><div className="ico"><Icon name="chartLine" /></div>{t('Log this exercise in a workout to see its progress here.')}</div>}
    <Button variant="soft" icon="info" onClick={() => exerciseDetailSheet(ex)}>{t('About this exercise')}</Button>
  </div>
}
