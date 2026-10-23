import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { useRatings } from '../store/useRatings.js'
import { EXIDX } from '../lib/exercises.js'
import { fmtNum } from '../lib/format.js'
import { t, dateLocale } from '../lib/i18n.js'
import { MUSCLE_NAME } from '../lib/muscles.js'
import { weekActions, applyMuscle, undoMuscle, applyDay, undoDay } from '../lib/statsActions.js'
import { bwSheet, startFlow } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import { Ring, WatchRow } from './Stats.jsx'

// Stats, the action version: instead of the numbers behind every workout, where the week
// stands and what is worth doing about it — each thing a sentence of what is wrong, what to
// do, and the button that does it (lib/statsActions.js, lib/liftfix.js). Every change can be
// undone from the same card. Whatever is fine is left off, so a short list is a good week.

const toast = m => useUI.getState().toast(m)
const nameOf = id => (EXIDX[id] || {}).n || id
// Monday-first weekday numbers, as weekdayPattern and dayAction have them (5 Jan 2026 is a Monday)
const WEEKDAY = wd => new Date(2026, 0, 5 + wd).toLocaleDateString(dateLocale(), { weekday: 'long' })
const dayName = iso => new Date(iso + 'T12:00:00').toLocaleDateString(dateLocale(), { weekday: 'long' })
const plural = (n, one, many) => t(n === 1 ? one : many, n)

function Card({ tone, icon, why, what, done, children }) {
  return <div className={'sx-act' + (done ? ' done' : '')}>
    <span className={'ic' + (tone ? ' ' + tone : '')}><Icon name={done ? 'check' : icon} /></span>
    <div className="bd">
      {why && <span className="why">{why}</span>}
      <span className="what">{what}</span>
      {children && <div className="acts">{children}</div>}
    </div>
  </div>
}

function Hero({ S, hero }) {
  const nav = useNavigate()
  const { done, planned, streak, next, risk } = hero
  const resume = !!S.active
  const line = resume ? t('A workout is in progress.')
    : risk ? t('Train once this week and your {0}-week streak stays alive.', streak)
      : next ? (next.today ? t('Today: {0}.', next.routine.name) : t('Next: {0}, {1}.', next.routine.name, dayName(next.iso)))
        : planned ? t('Week done. Every planned session is in.') : t('No sessions planned this week.')
  return <div className="sx-hero">
    <div className="top">
      <Ring done={done} planned={planned} />
      <div className="n"><b>{done}{planned > 0 && <small> / {planned}</small>}</b>
        <span>{planned > 0 || done ? t('sessions this week') : t('Nothing yet this week')}</span></div>
      {streak > 0 && <span className="streak"><Icon name="flame" />{t('{0} wk', streak)}</span>}
    </div>
    <p>{line}</p>
    {(resume || (next && (next.today || risk))) && <Button size="sm" variant="primary" onClick={() => (resume ? nav('/workout') : startFlow(next.routine.id))}>
      {resume ? t('Resume') : t('Start {0}', next.routine.name)}</Button>}
    {!resume && !next && !planned && <Button size="sm" variant="primary" onClick={() => nav('/plan')}>{t('Plan the week')}</Button>}
  </div>
}

export default function StatsActions({ switcher }) {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  useRatings()      // which exercise Peek suggests for a muscle depends on the ratings table
  const { hero, items, more } = weekActions(S, new Date())
  // what was accepted from here, by item key — kept so the card stays put as "done" with its
  // undo after the thing it fixed stops showing up on the list
  const [applied, setApplied] = useState({})
  const order = useRef([])
  items.forEach(i => { if (!order.current.includes(i.key)) order.current.push(i.key) })
  const live = Object.fromEntries(items.map(i => [i.key, i]))

  const accept = (key, act, apply, line) => {
    let did = null
    update(s => { did = apply(s, act) })
    if (!did) return
    setApplied(a => ({ ...a, [key]: { act: did, line } }))
    toast(line)
  }
  const undo = (key, fn) => {
    const { act } = applied[key]
    update(s => { fn(s, act) })
    setApplied(({ [key]: _, ...rest }) => rest)
    toast(t('Undone'))
  }

  const muscle = i => {
    const { gap, act } = i
    const m = t(MUSCLE_NAME[gap.m])
    const ex = nameOf(act.ex)
    const sets = act.sets === 1 ? t('1 set of {0}', ex) : t('{0} sets of {1}', act.sets, ex)
    return <Card key={i.key} icon="dumbbell"
      why={t('At this plan {0} ends the week at {1} of {2} sets.', m, fmtNum(Math.round(gap.projected * 10) / 10), gap.goal)}
      what={t('Add {0} to {1}’s {2}.', sets, dayName(act.iso), act.routine)}>
      <Button size="sm" variant="tinted" onClick={() => accept(i.key, act, applyMuscle, t('Added {0} to {1}', ex, act.routine))}>{plural(act.sets, 'Add {0} set', 'Add {0} sets')}</Button>
    </Card>
  }
  const muscleDone = (key, a) => <Card key={key} done what={a.line}>
    <button className="undo" onClick={() => undo(key, undoMuscle)}>{t('Undo')}</button>
  </Card>

  const day = i => {
    const a = i.act
    return <Card key={i.key} tone="warn" icon="calendar"
      why={t('You skipped {0} {1} of the last {2} times.', WEEKDAY(a.from), a.missed, a.planned)}
      what={a.often > 0 ? t('Move {0} to {1}, a day you already train.', a.routine, WEEKDAY(a.to)) : t('Move {0} to {1}, where it fits better.', a.routine, WEEKDAY(a.to))}>
      <Button size="sm" variant="tinted" onClick={() => accept(i.key, a, applyDay, t('{0} is now on {1}', a.routine, WEEKDAY(a.to)))}>{t('Move to {0}', WEEKDAY(a.to))}</Button>
    </Card>
  }
  const dayDone = (key, a) => <Card key={key} done what={a.line}>
    <button className="undo" onClick={() => undo(key, undoDay)}>{t('Undo')}</button>
  </Card>

  const weigh = i => <Card key={i.key} icon="scale"
    why={i.act.days == null ? t('No weigh-in yet.') : t('Last weigh-in {0} days ago.', i.act.days)}
    what={t('Log it so your pace and goal date stay accurate.')}>
    <Button size="sm" variant="tinted" onClick={() => bwSheet()}>{t('Log weight')}</Button>
  </Card>

  const row = key => {
    const i = live[key], a = applied[key]
    if (a) return key === 'day' ? dayDone(key, a) : muscleDone(key, a)
    if (!i) return null
    if (i.kind === 'lift') return <div key={key} className="card sa-card sx-lift"><WatchRow S={S} x={i.x} /></div>
    return i.kind === 'muscle' ? muscle(i) : i.kind === 'day' ? day(i) : weigh(i)
  }
  const rows = order.current.map(row).filter(Boolean)

  return <>
    <div className="hdr"><div><h1>{t('Stats')}</h1><div className="sub">{t('What to do this week')}</div></div>
      <button className="iconbtn" onClick={() => nav('/history')} aria-label={t('History')}><Icon name="history" /></button></div>
    {switcher}
    <Hero S={S} hero={hero} />
    <div className="sx-head"><b>{t('Worth doing')}</b><span>{rows.length ? plural(rows.length, '{0} thing', '{0} things') : ''}</span></div>
    {rows.length ? rows : <Card done what={t('Nothing to fix. No lift is stuck and the plan covers every muscle you train.')} />}
    {more > 0 && <div className="sx-more">{t('+{0} more once these are done', more)}</div>}
  </>
}
