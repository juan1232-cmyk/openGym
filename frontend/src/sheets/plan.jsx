// Weekly schedule (which routine runs which day, and one-off overrides) plus sharing a plan
// with someone else — export/print/import a routines-only file. Sibling concerns: both are
// about the *plan*, not a logged workout.
import { useState, useRef } from 'react'
import { useStore } from '../store/useStore.js'
import { todayISO, exCount, DAYN, fmtDate } from '../lib/format.js'
import { effectiveRoutineId } from '../lib/history.js'
import { t } from '../lib/i18n.js'
import { nav } from '../lib/nav.js'
import { starterRoutines } from '../lib/starter.js'
import Icon from '../components/Icon.jsx'
import { Button, Switch } from '../components/ui.jsx'
import { glyphOf, GLYPH_GROUPS } from '../lib/glyphs.js'
import { buildPlanBundle, parsePlan, mergePlan, printPlan } from '../lib/plan-share.js'
import { MOBILE, shareExport } from '../lib/mobile.js'
import { update, ui, toast } from './common.jsx'

/* ============================ starter plan ============================ */
export function loadStarterPlan() {
  const [push, pull, legs] = starterRoutines()
  update(st => {
    st.routines.push(push, pull, legs)
    st.week[1] = push.id; st.week[3] = pull.id; st.week[5] = legs.id
  })
  toast(t('Starter plan loaded — Mon Push · Wed Pull · Fri Legs'))
}

/* ============================ glyph picker ============================ */
// Grouped by what the glyph means for a training day, so picking one is a scan
// of four short rows rather than a hunt through twenty loose icons.
export const glyphPicker = (current, onPick) => {
  const cur = glyphOf(current)
  return ui().openSheet(close => <>
    <h3>{t('Pick an icon')}</h3>
    {GLYPH_GROUPS.map(g => (
      <div key={g.key} style={{ marginBottom: 14 }}>
        <div className="sect-t" style={{ padding: '0 2px 7px' }}>{t(g.key)}</div>
        <div className="glyph-grid">
          {g.items.map(n => (
            <button key={n} className={'glyph-cell' + (n === cur ? ' on' : '')}
              onClick={() => { close(); onPick(n) }} aria-label={n}>
              <Icon name={n} />
            </button>
          ))}
        </div>
      </div>
    ))}
    <div style={{ height: 4 }} />
  </>)
}

/* ============================ share / print / import a plan ============================ */
export const planToolsSheet = () => ui().openSheet(close => <PlanTools close={close} />)

function PlanTools({ close }) {
  const st = useStore(s => s.S)
  const user = useStore(s => s.user)
  const fileRef = useRef(null)
  const hasRoutines = (st.routines || []).some(r => r.ex && r.ex.length)

  const exportFile = async () => {
    const bundle = buildPlanBundle(st, user?.name ? t('{0}’s plan', user.name) : '')
    const json = JSON.stringify(bundle, null, 2)
    const name = 'opengym-plan-' + todayISO() + '.json'
    if (MOBILE) { try { await shareExport(json, name) } catch (e) { /* dismissed */ } close(); return }
    const blob = new Blob([json], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href)
    close(); toast(t('Plan file saved — send it to a friend'))
  }
  const pickFile = ev => {
    const f = ev.target.files[0]; ev.target.value = ''; if (!f) return
    const rd = new FileReader()
    rd.onload = () => {
      try { const bundle = parsePlan(rd.result); close(); planImportSheet(bundle) }
      catch (e) { toast(t('Import failed: {0}', e.message)) }
    }
    rd.readAsText(f)
  }

  return <>
    <h3>{t('Share your plan')}</h3>
    <div className="muted small" style={{ marginBottom: 16 }}>{t('Send your routines to a friend, or put your week on paper.')}</div>
    <Button variant="primary" icon="upload" onClick={exportFile} disabled={!hasRoutines}>{t('Export plan file')}</Button>
    <div className="dim small" style={{ margin: '7px 2px 0', lineHeight: 1.4 }}>{t('A small file a friend imports into their own openGym — routines only, none of your workouts or weigh-ins.')}</div>
    {!MOBILE && <>
      <div style={{ height: 12 }} />
      <Button variant="tinted" icon="download" onClick={() => { close(); printPlan(st, user?.name || '') }} disabled={!hasRoutines}>{t('Print / Save as PDF')}</Button>
      <div className="dim small" style={{ margin: '7px 2px 0', lineHeight: 1.4 }}>{t('A clean one-page-per-plan printout — no exercise ever splits across a page.')}</div>
    </>}
    {!hasRoutines && <div className="dim small" style={{ margin: '12px 2px 0' }}>{t('Add an exercise to a routine first — an empty plan has nothing to share.')}</div>}
    <h4 className="sec">{t('Got a plan from a friend?')}</h4>
    <Button variant="ghost" icon="folder" onClick={() => fileRef.current?.click()}>{t('Import a plan file')}</Button>
    <input ref={fileRef} type="file" accept="application/json,.json" onChange={pickFile} hidden />
  </>
}

export const planImportSheet = bundle => ui().openSheet(close => <PlanImport bundle={bundle} close={close} />)

function PlanImport({ bundle, close }) {
  const [schedule, setSchedule] = useState(false)
  const apply = () => {
    update(s => mergePlan(s, bundle, { schedule }))
    close()
    toast(t('Added {0} routines to your plan', bundle.routineCount))
    nav('/plan')
  }
  return <>
    <h3>{bundle.name ? t('Import “{0}”', bundle.name) : t('Import this plan')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>
      {t(bundle.routineCount === 1 ? '{0} routine' : '{0} routines', bundle.routineCount)}
      {' · ' + exCount(bundle.exerciseCount)}
      {bundle.scheduledDays > 0
        ? ' · ' + t(bundle.scheduledDays === 1 ? 'scheduled on {0} day' : 'scheduled on {0} days', bundle.scheduledDays)
        : ''}
    </div>
    <div className="dim small" style={{ marginBottom: 14, lineHeight: 1.4 }}>{t('These are added as new routines — nothing you already have is changed.')}</div>
    {bundle.dropped > 0 && <div className="small" style={{ color: 'var(--yellow)', marginBottom: 14, lineHeight: 1.4 }}>
      {t(bundle.dropped === 1
        ? '{0} exercise in the file isn’t in your library and was left out.'
        : '{0} exercises in the file aren’t in your library and were left out.', bundle.dropped)}
    </div>}
    {bundle.scheduledDays > 0 && <div className="row between" style={{ padding: '10px 2px', borderTop: '1px solid var(--sep)', borderBottom: '1px solid var(--sep)', marginBottom: 16, gap: 12 }}>
      <div><div className="tt" style={{ fontSize: 15 }}>{t('Use this weekly schedule')}</div><div className="small dim">{t('Replaces your current Mon–Sun assignments.')}</div></div>
      <Switch checked={schedule} onChange={setSchedule} />
    </div>}
    <Button variant="primary" onClick={apply}>{t('Add to my plan')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </>
}

/* ============================ day override / assign ============================ */
function DayOverride({ iso, close }) {
  const st = useStore(s => s.S)
  const wd = new Date(iso + 'T12:00:00').getDay()
  const weeklyR = st.routines.find(r => r.id === st.week[wd])
  const hasOvr = st.dayPlan[iso] !== undefined
  const effId = effectiveRoutineId(st, iso)
  const set = v => {
    update(s => { if (!v) delete s.dayPlan[iso]; else s.dayPlan[iso] = v })
    close()
    toast(v === '' ? t('Back to weekly plan') : v === 'rest' ? t('{0} set to rest', fmtDate(iso)) : t('{0} planned for {1}', (st.routines.find(r => r.id === v) || {}).name, fmtDate(iso)))
  }
  return <>
    <h3>{fmtDate(iso, true)}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('Weekly plan:')} {weeklyR ? weeklyR.name : t('Rest')}{hasOvr && <span style={{ color: 'var(--orange)' }}> · {t('changed for this day')}</span>}<br />{t('Sick, missed a day or want a different session? Pick what to train instead.')}</div>
    <div className="list">
      {st.routines.map(r => <div key={r.id} className="item" onClick={() => set(r.id)}>
        <span className="lrow-i"><Icon name={glyphOf(r.emoji)} /></span>
        <div className="grow"><div className="tt">{r.name}</div><div className="ss">{exCount(r.ex.length)}</div></div>
        {effId === r.id && <Icon name="check" className="accent" />}</div>)}
      <div className="item" onClick={() => set('rest')}><span className="lrow-i" style={{ background: 'var(--surface-3)' }}><Icon name="moon" /></span><div className="grow"><div className="tt">{t('Rest / skip this day')}</div></div>{effId === null && <Icon name="check" className="accent" />}</div>
      {hasOvr && <div className="item" onClick={() => set('')}><span className="lrow-i" style={{ background: 'var(--surface-3)' }}><Icon name="reset" /></span><div className="grow"><div className="tt">{t('Back to weekly plan')}</div></div></div>}
    </div>
  </>
}
export const dayOverrideSheet = iso => ui().openSheet(close => <DayOverride iso={iso} close={close} />)

function DayAssign({ day, close }) {
  const st = useStore(s => s.S)
  const set = v => { update(s => { if (v) s.week[day] = v; else delete s.week[day] }); close() }
  return <>
    <h3>{t(DAYN[day])}</h3>
    <div className="list">
      <div className="item" onClick={() => set('')}><span className="lrow-i" style={{ background: 'var(--surface-3)' }}><Icon name="moon" /></span><div className="grow"><div className="tt">{t('Rest day')}</div></div>{!st.week[day] && <Icon name="check" className="accent" />}</div>
      {st.routines.map(r => <div key={r.id} className="item" onClick={() => set(r.id)}>
        <span className="lrow-i"><Icon name={glyphOf(r.emoji)} /></span>
        <div className="grow"><div className="tt">{r.name}</div><div className="ss">{exCount(r.ex.length)}</div></div>
        {st.week[day] === r.id && <Icon name="check" className="accent" />}</div>)}
    </div>
  </>
}
export const dayAssignSheet = day => ui().openSheet(close => <DayAssign day={day} close={close} />)
