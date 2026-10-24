import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { DAYN, uid, exCount } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { dayAssignSheet, loadStarterPlan, planToolsSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import { glyphOf, DEFAULT_GLYPH } from '../lib/glyphs.js'
import { exOr } from '../lib/exercises.js'
import { WEEK_ORDER, daysOnRoutine, previewList } from '../lib/week.js'

// Home already shows the week as dots (what you did, what is planned). So here the routines
// are the page — what is in each and which days it is on — and the week is only the quiet
// schedule underneath, one line a day, for giving a day a routine.
export default function Plan() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const today = new Date().getDay()

  const addRoutine = () => {
    // starts on the progression the onboarding picked from your experience, if it asked
    const r = { id: uid(), name: t('New routine'), emoji: DEFAULT_GLYPH, ex: [], ...(S.progDefault ? { prog: S.progDefault } : {}) }
    update(s => { s.routines.push(r) })
    nav('/plan/r/' + r.id)
  }

  const short = d => t(DAYN[d]).slice(0, 3)

  const routineCard = r => {
    const days = daysOnRoutine(S.week, r.id)
    const { shown, more } = previewList(r.ex.map(e => exOr(e.id).n))
    return <div key={r.id} className="pl-rt" onClick={() => nav('/plan/r/' + r.id)}>
      <div className="pl-rh">
        <span className="lrow-i"><Icon name={glyphOf(r.emoji)} /></span>
        <div className="grow"><div className="tt">{r.name}</div><div className="ss">{exCount(r.ex.length)}</div></div>
        <Icon name="chevronRight" className="chev" />
      </div>
      <div className="pl-days">{days.length
        ? days.map(d => <span key={d} className={'tag acc' + (d === today ? ' now' : '')}>{short(d)}</span>)
        : <span className="pl-none">{t('Not on any day yet')}</span>}</div>
      {shown.length > 0 && <ul className="pl-ex">{shown.map((n, i) => <li key={i}>{n}</li>)}{more > 0 && <li className="more">{t('+{0} more', more)}</li>}</ul>}
    </div>
  }

  const scheduleRow = d => {
    const r = S.routines.find(x => x.id === S.week[d])
    // a day picked in the onboarding with nothing on it yet is waiting for a routine, not a rest day
    const waiting = !r && (S.trainDays || []).includes(d)
    return <button key={d} className={'pl-sr' + (d === today ? ' today' : '')} onClick={() => dayAssignSheet(d)}>
      <span className="pl-sd">{short(d)}</span>
      <span className={'pl-sv' + (r ? '' : ' off')}>{r ? r.name : waiting ? t('Training day') : t('Rest')}</span>
      <Icon name="chevronRight" className="chev" />
    </button>
  }

  return <>
    <div className="hdr">
      <div><h1>{t('Plan')}</h1><div className="sub">{t('Your weekly routine')}</div></div>
      <button className="iconbtn" onClick={planToolsSheet} aria-label={t('Share your plan')} title={t('Share your plan')}><Icon name="upload" /></button>
    </div>
    {/* The way into building a plan: big, first, and there whether or not any routine exists. */}
    <Button variant="primary" icon="plus" className="pl-new" onClick={addRoutine}>{t('New routine')}</Button>
    {S.routines.length ? <div className="cols"><div>
      <h4 className="sec">{t('Routines')}</h4>
      <div className="list">{S.routines.map(routineCard)}</div>
    </div><div>
      <h4 className="sec">{t('Week schedule')}</h4>
      <div className="pl-sched" data-tour="plan-main">{WEEK_ORDER.map(scheduleRow)}</div>
    </div></div> : <div data-tour="plan-main">
      <div className="empty"><div className="ico"><Icon name="clipboard" /></div>{t('No routines yet.')}<br />{t('Create one or load the starter plan.')}</div>
      <Button icon="sparkles" onClick={loadStarterPlan}>{t('Load starter plan (Push / Pull / Legs)')}</Button>
    </div>}
  </>
}
