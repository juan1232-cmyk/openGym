import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { effectiveRoutine, effectiveRoutineId, streakWeeks, lastBW } from '../lib/history.js'
import { fmtNum, fmtDate, todayISO, isoOf, durPart } from '../lib/format.js'
import { t, dateLocale } from '../lib/i18n.js'
import { weeklyVolumes, volumeBars, partOfDay } from '../lib/dashboard.js'
import { coach, coachLine, pokeReaction } from '../lib/peek/coach.js'
import { visit, stageOf, rememberPoked } from '../lib/peek/memory.js'
import { pickLine } from '../lib/peek/lines.js'
import { getPeek, updatePeek, said } from '../store/peek.js'
import PeekSay from '../components/PeekSay.jsx'
import { EXIDX } from '../lib/exercises.js'
import { bwSheet, goalSheet, dayOverrideSheet, calendarSheet, startFlow, loadStarterPlan, bwDeltaColor, workoutDetailSheet } from '../sheets.jsx'
import LineChart from '../components/LineChart.jsx'
import Icon from '../components/Icon.jsx'
import Orb from '../components/Orb.jsx'
import { Button } from '../components/ui.jsx'

const nameOf = id => (EXIDX[id] || {}).n || id
const TAPS = ['joyful-wide', 'surprised-left', 'small-attentive', 'curious-left']
const hhmm = d => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')

// The orb as coach (lib/peek, docs/PEEK.md): a mood and maybe a line from coach.js, a bubble
// that takes a moment to show up (it's reacting, not a tooltip), and a temper if you keep
// poking it. A tap's mood and line only last a few seconds before it goes back to what it
// thinks of your training. Two moments are its own: asleep in the small hours until you tap
// it, and a cold, then curious, reunion the first time you open the app after 5+ days away.
function Coach({ S }) {
  // memory as it was when Home opened: the visit below rewrites it, and the mood shouldn't
  // jump the moment it does
  const peek0 = useRef(getPeek()).current
  const now0 = useRef(new Date()).current
  const base = useMemo(() => coach(S, now0, nameOf, peek0), [S.workouts, S.week, S.dayPlan, S.routines, S.active])
  const asleep = now0.getHours() < 6 && !base.signals.active && !base.signals.freshPR
  const voice = peek0.voice
  const opts = { stage: stageOf(peek0.bond), honesty: peek0.honesty, said: peek0.said }
  const [over, setOver] = useState(null)
  const [awake, setAwake] = useState(!asleep)
  const orb = useRef(null), pokes = useRef([]), calm = useRef(0), seq = useRef(0)
  const mood = (over && over.mood) || (awake ? base.mood : 'sleeping')
  const line = !voice ? null : over ? over.line : awake ? base.line : null

  const hold = (o, ms = 6000) => {
    setOver(o)
    clearTimeout(calm.current)
    calm.current = setTimeout(() => { setOver(null); pokes.current = [] }, ms)
  }

  useEffect(() => {
    const v = visit(peek0, S, now0, base.raw)
    if (v.changed) updatePeek(() => v.peek)
    if (v.reunion && !asleep) {
      const l = pickLine('reunion', [v.daysOff], Math.random, opts)
      hold({ mood: 'cold', line: null }, 12000)
      seq.current = setTimeout(() => { hold({ mood: 'curious', line: l && l.text }, 7000); said(l) }, 2600)
    }
    return () => { clearTimeout(calm.current); clearTimeout(seq.current) }
  }, [])

  const onPoke = () => {
    if (!awake) {
      setAwake(true)
      orb.current?.react('surprised-wide-left', 700)
      const l = pickLine('asleep', [hhmm(new Date())], Math.random, opts)
      hold({ mood: 'drowsy', line: l && l.text }); said(l)
      return
    }
    const now = Date.now()
    pokes.current = pokes.current.filter(x => now - x < 4000).concat(now)
    const r = pokeReaction(pokes.current.length, Math.random)
    if (r) {
      hold({ mood: r.mood, line: r.line || line })
      if (r.mood === 'angry') updatePeek(p => rememberPoked(p, new Date()))
    } else {
      orb.current?.react(TAPS[Math.floor(Math.random() * TAPS.length)], 900)
      const l = Math.random() < 0.4 ? coachLine(base.mood, base.signals, Math.random, opts) : null
      if (l && l !== line) hold({ mood: base.mood, line: l })
    }
  }

  return <div className="pk-coachtop">
    <Orb ref={orb} size={88} mood={mood} onPoke={onPoke} />
    <PeekSay line={line} delay={over ? 200 : 600 + Math.random() * 1400} />
  </div>
}

const GREETING = {
  morning: ['Morning, {0}.', 'Good morning.'],
  afternoon: ['Afternoon, {0}.', 'Good afternoon.'],
  evening: ['Evening, {0}.', 'Good evening.']
}

// Home — D3 "dashboard" from the Peek design: what to do today, the week at a glance, and
// the last few sessions. Deeper charts and full history stay in Stats. Two things the design
// doesn't show are kept on purpose: the body-weight card (half of what this app tracks) and
// the no-plan card for a profile that skipped the Goals step.
export default function Home() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)

  const now = new Date()
  const today = todayISO()
  const routine = effectiveRoutine(S, today)
  const A = S.active

  // the current week, Monday first
  const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  const doneDays = new Set(S.workouts.map(w => w.d))
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i)
    const iso = isoOf(d)
    return { iso, d, done: doneDays.has(iso), planned: effectiveRoutineId(S, iso), moved: S.dayPlan[iso] !== undefined, today: iso === today }
  })

  const weeks = weeklyVolumes(S.workouts, 8, now)
  const bars = volumeBars(weeks)
  const streak = streakWeeks(S)
  const recent = S.workouts.slice(-4).reverse()

  const [hi, anon] = GREETING[partOfDay(now.getHours())]
  const headline = A ? t('{0} in progress.', A.name) : routine ? t('{0} today.', routine.name) : t('Rest day today.')
  const onToday = () => { if (A) nav('/workout'); else if (routine) startFlow(routine.id); else dayOverrideSheet(today) }

  const bw = lastBW(S)
  const prevBW = S.bodyweight.length > 1 ? S.bodyweight[S.bodyweight.length - 2] : null
  const delta = bw && prevBW ? bw.w - prevBW.w : null
  const bwPoints = S.bodyweight.slice(-30).map(b => ({ t: b.t || new Date(b.d).getTime(), y: b.w, d: b.d }))

  return <div className="narrow pk-home">
    <div className="pk-top">
      <Coach S={S} />
      <button className="iconbtn" onClick={() => nav('/settings')} aria-label={t('Settings')}><Icon name="gear" /></button>
    </div>
    <div className="pk-greet">
      <span>{now.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'short' })}</span>
      <h1>{user ? t(hi, user.name) : t(anon)}<br />{headline}</h1>
    </div>

    <div className="card pk-today">
      <div className="pk-week">
        {days.map(x => (
          <button key={x.iso} className={'pk-day' + (x.today ? ' today' : '')} onClick={() => dayOverrideSheet(x.iso)}
            aria-label={x.d.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}>
            <span>{x.d.toLocaleDateString(dateLocale(), { weekday: 'narrow' })}</span>
            <i className={x.done ? 'done' : x.planned ? (x.moved ? 'plan moved' : 'plan') : ''} />
          </button>
        ))}
      </div>
      <Button variant="primary" onClick={onToday}>
        {A ? t('Resume {0}', A.name) : routine ? t('Start {0}', routine.name) : t('Plan a session today')}
      </Button>
    </div>

    <div className="pk-tiles">
      <div className="pk-tile"><span>{t('This week')}</span><b>{fmtNum(weeks[weeks.length - 1].vol)}<small> {S.unit}</small></b></div>
      <button className="pk-tile" onClick={() => calendarSheet()}><span>{t('Streak')}</span><b>{streak}<small> {t(streak === 1 ? 'week' : 'weeks')}</small></b></button>
      <div className="pk-tile"><span>{t('Sessions')}</span><b>{S.workouts.length}</b></div>
    </div>

    {!S.routines.length && !A && (
      <div className="card">
        <div className="pk-card-h"><b>{t('No plan yet')}</b></div>
        <div className="muted small" style={{ margin: '8px 0 12px' }}>{t('Set up your weekly routine to get going — or load a ready-made Push / Pull / Legs plan.')}</div>
        <Button variant="primary" onClick={loadStarterPlan}>{t('Load starter plan (PPL)')}</Button>
        <div style={{ height: 8 }} /><Button variant="soft" onClick={() => nav('/plan')}>{t('Build my own plan')}</Button>
      </div>
    )}

    <div className="card">
      <div className="pk-card-h"><b>{t('Weekly volume')}</b><span>{t('Last {0} weeks', weeks.length)}</span></div>
      <div className="pk-bars" role="img" aria-label={t('Weekly volume')}>
        {bars.map(b => <i key={b.wk} className={b.cur ? 'cur' : b.best ? 'best' : ''} style={{ height: Math.max(6, Math.round(b.h * 92)) }} />)}
      </div>
    </div>

    {recent.length > 0 && (
      <div className="card pk-list">
        <div className="pk-card-h"><b>{t('Previous trainings')}</b><button onClick={() => nav('/history')}>{t('See all')}</button></div>
        {recent.map(w => (
          <button key={w.id} className="pk-row" onClick={() => workoutDetailSheet(w)}>
            <span className="l"><b>{w.name}</b><span>{[fmtDate(w.d, true), ...durPart(w.end - w.start)].join(' · ')}</span></span>
            <span className="v">{fmtNum(w.vol || 0)} {S.unit}</span>
          </button>
        ))}
      </div>
    )}

    <div className="card">
      <div className="pk-card-h">
        <b>{t('Body weight')}</b>
        <div className="row" style={{ gap: 6 }}>
          <Button size="sm" variant="soft" icon="target" onClick={goalSheet}>{S.targetW ? fmtNum(S.targetW) : t('Goal')}</Button>
          <Button size="sm" variant="soft" icon="plus" onClick={() => bwSheet()}>{t('Log')}</Button>
        </div>
      </div>
      {bw ? <>
        <div className="row" style={{ gap: 8, alignItems: 'baseline', marginTop: 10 }}>
          <div className="pk-big">{fmtNum(bw.w)}<small> {S.unit}</small></div>
          {/* only when it actually moved — an unchanged weight used to read as "− 0" */}
          {!!delta && (
            <span className="small row" style={{ gap: 2, fontWeight: 500, color: bwDeltaColor(delta, bw.w) }}>
              <Icon name={delta > 0 ? 'arrowUp' : 'arrowDown'} style={{ fontSize: 12 }} />
              {fmtNum(Math.abs(delta))}
            </span>
          )}
          <span className="dim small" style={{ marginLeft: 'auto' }}>{fmtDate(bw.d, true)}</span>
        </div>
        {S.targetW && (
          <div className="small muted" style={{ marginTop: 4 }}>
            {t('Goal')} {fmtNum(S.targetW)} {S.unit} · {Math.abs(S.targetW - bw.w) < 0.05 ? t('reached!') : t(S.targetW > bw.w ? '{0} to gain' : '{0} to lose', fmtNum(Math.abs(S.targetW - bw.w)) + ' ' + S.unit)}
          </div>
        )}
        <div className="chart" style={{ marginTop: 8 }}><LineChart points={bwPoints} h={130} unit={S.unit} goal={S.targetW} /></div>
      </> : <div className="muted small" style={{ marginTop: 8 }}>{t("No entries yet — log your weight to start the curve. It's also asked before every workout.")}</div>}
    </div>
  </div>
}
