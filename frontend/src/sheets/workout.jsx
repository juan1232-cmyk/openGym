// The workout lifecycle: starting one, the workout-detail view, top-set weight confirmation,
// finishing (with the PR/1RM summary), the calendar (which doubles as day-planning entry
// point), and importing workout/bodyweight history from another app's export.
import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { EXIDX } from '../lib/exercises.js'
import { fmtDate, fmtNum, fmtVol, fmtDur, durPart, todayISO, isoOf, uid, MONTHS_LONG, DAYN } from '../lib/format.js'
import { bestWeightFor, buildSets, effectiveRoutine, effectiveRoutineId, workoutVolume, setsDone, setsDoneActive, supersetUnits, unitOf, setLabel, effortOf, previousSession, topSet, nextSetLabel } from '../lib/history.js'
import { beep } from '../lib/sound.js'
import { t } from '../lib/i18n.js'
import { nav } from '../lib/nav.js'
import { glyphOf } from '../lib/glyphs.js'
import Icon from '../components/Icon.jsx'
import { Thumb } from '../components/Media.jsx'
import BodyMap from '../components/BodyMap.jsx'
import Orb from '../components/Orb.jsx'
import { Button } from '../components/ui.jsx'
import { loadOfWorkouts, rankOf, MUSCLE_NAME } from '../lib/muscles.js'
import { afterWorkout, stageOf } from '../lib/peek/memory.js'
import { journeySteps, finishVerdict } from '../lib/peek/moments.js'
import { getPeek, sayNow, said } from '../store/peek.js'
import PeekSay from '../components/PeekSay.jsx'
import { parseImport, mergeImport } from '../lib/import-csv.js'
import { is1RMRecord } from '../lib/onerm.js'
import { nextPrescription, applyPrescription } from '../lib/progression.js'
import { S, update, ui, toast, snd, confirmSheet, WeightInput } from './common.jsx'
import { bwSheet } from './bodyweight.jsx'
import { dayOverrideSheet } from './plan.jsx'

/* ============================ import from another app ============================ */
// Shows what a parsed export would actually do before anything is written. An import is
// the one action where "just try it" is expensive — it's someone's entire training
// history — so the numbers, the unit conversion and the exercises we couldn't recognise
// are all on screen before the confirm button.
function ImportSummary({ parsed, close }) {
  const st = useStore(s => s.S)
  const isBW = parsed.kind === 'bodyweight'
  const have = isBW
    ? parsed.bodyweight.filter(b => st.bodyweight.some(x => x.d === b.d)).length
    : parsed.workouts.filter(w => st.workouts.some(x => x.d === w.d)).length
  const fresh = (isBW ? parsed.bodyweight.length : parsed.workouts.length) - have

  const doImport = () => {
    let res
    update(s => { res = mergeImport(s, parsed) })
    close()
    toast(isBW
      ? t('{0} weigh-ins imported', res.added)
      : t('{0} workouts imported', res.added))
  }

  return <>
    <h3>{parsed.source ? t('Import from {0}', parsed.source) : t('Import history')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>
      {parsed.from === parsed.to ? fmtDate(parsed.from, true) : fmtDate(parsed.from, true) + ' – ' + fmtDate(parsed.to, true)}
    </div>

    <div className="tiles" style={{ textAlign: 'left' }}>
      {isBW ? <>
        <div className="tile"><div className="l">{t('Weigh-ins')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{parsed.bodyweight.length}</div></div>
        <div className="tile"><div className="l">{t('New')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{fresh}</div></div>
      </> : <>
        <div className="tile"><div className="l">{t('Workouts')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{parsed.workouts.length}</div></div>
        <div className="tile"><div className="l">{t('Sets')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{parsed.sets}</div></div>
        <div className="tile"><div className="l">{t('Exercises matched')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{parsed.matched}</div></div>
        <div className="tile"><div className="l">{t('Added as your own')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{parsed.created}</div></div>
      </>}
    </div>

    {parsed.mixedUnits ? <div className="small" style={{ color: 'var(--yellow)', marginBottom: 10 }}>
      {t('The file mixes kg and lb — each set is converted to {0}.', st.unit)}
    </div> : parsed.converted ? <div className="small" style={{ color: 'var(--yellow)', marginBottom: 10 }}>
      {t('The file is in {0} and your profile is in {1} — weights will be converted.', parsed.fileUnit, st.unit)}
    </div> : null}
    {!isBW && !parsed.fileUnit && !parsed.mixedUnits && <div className="small dim" style={{ marginBottom: 10 }}>
      {t('The file does not say which unit it uses — numbers are imported as they are.')}
    </div>}
    {have > 0 && <div className="small dim" style={{ marginBottom: 10 }}>
      {t('{0} days already have data here and will be left alone.', have)}
    </div>}
    {/* The file rated its sets. Say so: the column is off by default, so the ratings would
        otherwise arrive invisibly and look like they had been dropped. */}
    {!isBW && (parsed.rirSets + parsed.rpeSets) > 0 && <div className="small dim" style={{ marginBottom: 10 }}>
      {t(effortOf(st) === 'none'
        ? '{0} sets bring an {1} with them — switch on Effort per set in Settings to see it.'
        : '{0} sets bring an {1} with them.',
      parsed.rirSets || parsed.rpeSets, parsed.rirSets ? 'RIR' : 'RPE')}
    </div>}
    {!isBW && parsed.unmatchedNames.length > 0 && <>
      <h4 className="sec">{t('Not in the library — added as your own exercises')}</h4>
      <div className="mchips" style={{ marginBottom: 12 }}>
        {parsed.unmatchedNames.slice(0, 12).map(n => <span key={n} className="mchip capitalize">{n}</span>)}
        {parsed.unmatchedNames.length > 12 && <span className="mchip">+{parsed.unmatchedNames.length - 12}</span>}
      </div>
    </>}

    <Button variant="primary" onClick={doImport} disabled={!fresh}>
      {fresh ? t('Import') : t('Nothing new to import')}
    </Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </>
}

/** Read a CSV/XML export, then show what it would do. */
export function importFromApp(file, onDone) {
  const rd = new FileReader()
  rd.onload = () => {
    let parsed
    try { parsed = parseImport(String(rd.result), { unit: S().unit }) }
    catch (e) { toast(t('Could not read that file')); return }
    if (parsed.error === 'empty') { toast(t('That file is empty')); return }
    if (parsed.error) { toast(t("That file's columns aren't recognised — see the docs for supported apps.")); return }
    if (parsed.kind === 'bodyweight' ? !parsed.bodyweight.length : !parsed.workouts.length) {
      toast(t('Nothing to import from that file')); return
    }
    ui().openSheet(close => <ImportSummary parsed={parsed} close={close} />)
    onDone && onDone()
  }
  rd.onerror = () => toast(t('Could not read that file'))
  rd.readAsText(file)
}

/* ============================ workout detail ============================ */
function WorkoutDetail({ w, close }) {
  const st = useStore(s => s.S)
  return <>
    <h3>{w.name}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{[fmtDate(w.d, true), ...durPart(w.end - w.start), fmtVol(w.vol, st.unit), ...(w.bw ? [fmtNum(w.bw) + ' ' + st.unit] : [])].join(' · ')}</div>
    {w.entries.map((e, i) => {
      const ex = EXIDX[e.id]
      return <div key={i} className="row" style={{ marginBottom: 12, alignItems: 'flex-start' }}>
        {ex && <Thumb ex={ex} />}
        <div className="grow"><div className="tt capitalize" style={{ fontWeight: 600 }}>{ex ? ex.n : (e.n || e.id)} {w.prs && w.prs.includes(e.id) && <span className="pr"><Icon name="trophy" />PR</span>}</div>
          <div className="ss">{e.sets.filter(s => s.done).map(s => setLabel(e.id, s, e.target)).join('  ·  ') || t('no sets')}</div></div>
      </div>
    })}
    <Button variant="danger" onClick={() => confirmSheet({ title: t('Delete workout?'), message: t('This removes it from your history for good.'), confirmText: t('Delete'), danger: true, onConfirm: () => { update(s => { s.workouts = s.workouts.filter(x => x.id !== w.id) }); close(); toast(t('Workout deleted')) } })}>{t('Delete workout')}</Button>
  </>
}
export const workoutDetailSheet = w => ui().openSheet(close => <WorkoutDetail w={w} close={close} />)

/* ============================ calendar ============================ */
function Calendar({ start, close }) {
  const st = useStore(s => s.S)
  const [cur, setCur] = useState(() => { const d = start ? new Date(start) : new Date(); d.setDate(1); return d })
  const y = cur.getFullYear(), mo = cur.getMonth()
  const byDay = {}
  st.workouts.forEach(w => (byDay[w.d] = byDay[w.d] || []).push(w))
  const startOffset = (new Date(y, mo, 1).getDay() + 6) % 7
  const daysIn = new Date(y, mo + 1, 0).getDate()
  const monthWs = st.workouts.filter(w => w.d.startsWith(y + '-' + String(mo + 1).padStart(2, '0')))
  const monthVol = monthWs.reduce((a, w) => a + (w.vol || 0), 0)
  const monthMs = monthWs.reduce((a, w) => a + Math.max(0, (w.end || w.start) - w.start), 0)
  const cells = []
  for (let i = 0; i < startOffset; i++) cells.push(<div key={'e' + i} />)
  for (let d = 1; d <= daysIn; d++) {
    const iso = y + '-' + String(mo + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0')
    const ws = byDay[iso], effId = effectiveRoutineId(st, iso), ovr = st.dayPlan[iso] !== undefined
    const dotCls = ws ? 'done' : ovr && effId ? 'ovr' : effId ? 'plan' : ''
    cells.push(<button key={d} className={'cal-d' + (ws ? ' has' : '') + (iso === todayISO() ? ' today' : '')} onClick={() => {
      if (!ws) { close(); dayOverrideSheet(iso); return }
      if (ws.length === 1) { close(); workoutDetailSheet(ws[0]); return }
      close(); ui().openSheet(c2 => <><h3>{fmtDate(iso, true)}</h3><div className="list">{ws.map(w => <WorkoutRow key={w.id} w={w} onClick={() => { c2(); workoutDetailSheet(w) }} />)}</div></>)
    }}><span>{d}</span><i className={dotCls} /></button>)
  }
  return <>
    <div className="row between" style={{ marginBottom: 2 }}>
      <button className="iconbtn" onClick={() => setCur(new Date(y, mo - 1, 1))} aria-label="Previous month"><Icon name="chevronLeft" /></button>
      <h3 style={{ margin: 0 }}>{t(MONTHS_LONG[mo])} {y}</h3>
      <button className="iconbtn" onClick={() => setCur(new Date(y, mo + 1, 1))} aria-label="Next month"><Icon name="chevronRight" /></button>
    </div>
    <div className="small muted" style={{ textAlign: 'center' }}>{monthWs.length ? `${t(monthWs.length === 1 ? '{0} workout' : '{0} workouts', monthWs.length)} · ${fmtDur(monthMs)} · ${fmtVol(monthVol, st.unit)}` : t('No workouts this month')}</div>
    <div className="cal-grid">{['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(l => <div key={l} className="cal-h">{t(l)}</div>)}{cells}</div>
    <div className="cal-legend">
      <span><i style={{ background: 'var(--acc)' }} />{t('Trained')}</span>
      <span><i style={{ background: 'var(--label-3)' }} />{t('Planned')}</span>
      <span><i style={{ background: 'var(--orange)' }} />{t('Rescheduled')}</span>
    </div>
    <div className="small dim" style={{ textAlign: 'center', marginTop: 10 }}>{t('Tap a trained day for details · tap any other day to plan a session')}</div>
  </>
}
export const calendarSheet = start => ui().openSheet(close => <Calendar start={start} close={close} />)

/* shared small workout row (used in lists) */
export function WorkoutRow({ w, onClick }) {
  const st = useStore(s => s.S)
  const glyph = glyphOf((st.routines.find(r => r.id === w.routineId) || {}).emoji)
  return <div className="item" onClick={onClick}>
    <span className="lrow-i" style={{ width: 34, height: 34, borderRadius: 8, fontSize: 19 }}><Icon name={glyph} /></span>
    <div className="grow"><div className="tt">{w.name}</div>
      <div className="ss">{[fmtDate(w.d, true), ...durPart(w.end - w.start), t('{0} sets', setsDone(w)), fmtVol(w.vol, st.unit)].join(' · ')}</div></div>
    {w.prs && w.prs.length > 0 && <span className="pr"><Icon name="trophy" />{w.prs.length} PR</span>}
    <Icon name="chevronRight" className="chev" />
  </div>
}

/* ============================ workout lifecycle ============================ */
export function startFlow(routineId) {
  bwSheet({ required: true, onDone: bw => beginWorkout(routineId, bw) })
}
export function beginWorkout(routineId, bw) {
  const st = S()
  const r = routineId ? st.routines.find(x => x.id === routineId) : null
  // The prescription is applied as the session is built, so you walk up to the bar with the
  // right weight already on the screen instead of being told about it afterwards. `plan` is
  // kept on the entry purely so the workout can explain the number it chose.
  const entries = (r ? r.ex : []).map(cfg => {
    const plan = nextPrescription(st, cfg, r)
    return { id: cfg.id, sg: cfg.sg, target: { ...cfg }, plan, sets: applyPrescription(buildSets(st, cfg), plan) }
  })
  update(s => {
    s.active = { id: uid(), d: todayISO(), start: Date.now(), routineId, name: r ? r.name : t('Freestyle'), bw: bw || null, cur: 0, entries }
  })
  useUI.getState().stopRest()
  nav('/workout')
}
function TopWeight({ entryIdx, close }) {
  const st = useStore(s => s.S)
  const A = st.active
  // The workout can end underneath this sheet: finishing from the last exercise clears
  // `active`, and this re-renders before the sheet is torn down. Everything below is
  // read defensively and the sheet dismisses itself — reading A.entries straight took
  // the whole app down with it. Hooks still run unconditionally, so the bail-out has
  // to sit after every one of them.
  const entry = A ? A.entries[entryIdx] : null
  const ex = entry && EXIDX[entry.id]
  const maxSet = entry ? Math.max(0, ...entry.sets.filter(s => s.done).map(s => s.w || 0)) : 0
  const prevBest = entry ? Math.max((st.exWeights[entry.id] || {}).w || 0, bestWeightFor(st, entry.id)) : 0
  const [v, setV] = useState(entry ? (Math.max(maxSet, prevBest) || entry.target.weight || 0) : 0)
  useEffect(() => { if (!entry) close() }, [!entry])

  const units = supersetUnits(A ? A.entries : [])
  const unit = entry ? unitOf(units, entryIdx) : []
  const unitDone = !!entry && unit.every(i => A.entries[i].sets.every(s => s.done))
  const unitIdx = units.findIndex(u => u === unit)
  const isLastUnit = unitIdx === units.length - 1
  if (!entry || !ex) return null

  const commit = advance => {
    const n = Math.round((v || 0) * 10) / 10
    if (!isFinite(n) || n < 0) { toast(t('Enter a valid weight')); return }
    update(s => {
      s.active.entries[entryIdx].topW = n
      const cur = s.exWeights[entry.id]
      s.exWeights[entry.id] = { w: Math.max(n, cur ? cur.w : 0), d: todayISO() }
    })
    close()
    if (advance && unitDone) {
      if (isLastUnit) workoutCompleteSheet()               // whole workout done → finish/continue prompt
      else update(s => { s.active.cur = units[unitIdx + 1][0] })
    } else toast(t('Tracked — next time starts at {0}', fmtNum(S().exWeights[entry.id].w) + ' ' + st.unit))
  }
  return <>
    <h3 className="capitalize row" style={{ gap: 8 }}><Icon name="checkCircle" style={{ color: 'var(--acc)' }} />{t('{0} done', ex.n)}</h3>
    <div className="muted small">{t('Confirm the weight you worked with — your highest becomes the default next time.')}{!unitDone && unit.length > 1 ? ' ' + t('Then finish the superset partner.') : ''}</div>
    <WeightInput value={v} setValue={setV} unit={st.unit} />
    <div style={{ height: 10 }} />
    {prevBest > 0 ? <div className="small dim" style={{ textAlign: 'center', marginBottom: 12 }}>{t('Previous best:')} {fmtNum(prevBest)} {st.unit}{maxSet > prevBest && <span style={{ color: 'var(--yellow)' }}> — {t('new record!')}</span>}</div> : <div style={{ height: 4 }} />}
    {unitDone ? <>
      <Button variant="primary" trailingIcon={isLastUnit ? null : 'chevronRight'} onClick={() => commit(true)}>{isLastUnit ? t('Save') : t('Save & next exercise')}</Button>
      <div style={{ height: 8 }} /><Button variant="ghost" className="dim" onClick={() => commit(false)}>{t('Just close')}</Button>
    </> : <Button variant="primary" onClick={() => commit(false)}>{t('Save weight')}</Button>}
  </>
}
export const topWeightSheet = entryIdx => ui().openSheet(close => <TopWeight entryIdx={entryIdx} close={close} />)

// Shown when the last exercise's last set is checked — finish, or keep going.
function WorkoutComplete({ close }) {
  return <div style={{ textAlign: 'center', padding: '8px 0' }}>
    <div style={{ fontSize: 44, display: 'flex', justifyContent: 'center', color: 'var(--acc)' }}><Icon name="checkCircle" /></div>
    <h3 style={{ margin: '8px 0' }}>{t("That's the whole workout!")}</h3>
    <div className="muted small" style={{ marginBottom: 16 }}>{t('Every exercise done — great work. Finish up, or keep going and add another exercise.')}</div>
    <Button variant="primary" icon="flag" onClick={() => { close(); finishWorkout() }}>{t('Finish workout')}</Button>
    <div style={{ height: 8 }} />
    <Button onClick={() => { close(); useUI.getState().toast(t('Keep going — tap “+ Add exercise” below')) }}>{t('Continue workout')}</Button>
  </div>
}
export const workoutCompleteSheet = () => ui().openSheet(close => <WorkoutComplete close={close} />, { kind: 'center' })

// The end of a workout as a journey (lib/peek/moments.js journeySteps): a few screens in a
// row, each saying one thing, with Peek reacting throughout and giving its verdict near the
// end. A big day gets the whole story (numbers, records, what you trained, what's next); a
// normal day gets out of the way in three taps; leaving early gets a screen about what was
// left behind. Skip jumps straight to the summary, which is where Done and Share live.
const STEP_LABEL = {
  done: 'Finished', first: 'Session one', numbers: 'The numbers', record: 'Something happened',
  skipped: 'Left behind', trained: 'What you trained', next: 'Next time', verdict: "Peek's verdict", summary: 'Summary'
}
const exName = id => (EXIDX[id] || {}).n || id
function FinishJourney({ w, prs, prevBest, e1prs = [], left, skipped, prev, plan, close }) {
  const st = useStore(s => s.S)
  const user = useStore(s => s.user)
  const unit = st.unit
  const [i, setI] = useState(0)
  const entryOf = id => w.entries.find(e => e.id === id)
  const diff = prev ? (w.vol || 0) - (prev.vol || 0) : null
  const worked = rankOf(loadOfWorkouts([w])).worked
  const line = [w.name, ...durPart(w.end - w.start), t(setsDone(w) === 1 ? '{0} set' : '{0} sets', setsDone(w))].join(' · ')

  const { v, steps } = plan
  const step = steps[i]
  const theme = step === 'record' ? 'ink' : step === 'verdict' ? (v.tone === 'good' ? 'go' : v.tone === 'bad' ? 'ink' : '') : ''

  const onward = () => setI(x => Math.min(steps.length - 1, x + 1))
  const done = () => { close(); nav('/home') }
  // the system share sheet where there is one, the clipboard where there isn't
  const share = async () => {
    const text = line + ' · ' + fmtVol(w.vol, unit)
    try {
      if (navigator.share) await navigator.share({ text })
      else { await navigator.clipboard.writeText(text); toast(t('Copied to clipboard')) }
    } catch (e) { if (e.name !== 'AbortError') toast(t('Could not share')) }
  }

  const rxLabel = ({ p, cfg }) => p.weight > 0 ? fmtNum(p.weight) + ' ' + unit + ' × ' + (p.reps || cfg.reps || '')
    : p.sec ? p.sec + 's' : '× ' + (p.reps || cfg.reps || '')
  const rxWhy = kind => t(kind === 'up' ? 'Heavier' : kind === 'deload' ? 'Lighter, on purpose' : kind === 'first' ? 'Starting point' : 'Same weight, beat the reps')

  const body = {
    done: <div className="pkj-center">
      <Orb size={200} mood="curious" />
      <PeekSay line={plan.open} delay={500} className="up" />
      <h1 className="pkj-huge">{t('Done.')}</h1>
      <p className="pkj-sub">{line}</p>
    </div>,
    first: <div className="pkj-center">
      <Orb size={180} mood="shy" />
      <h1 className="pkj-h">{t('Session one.')}</h1>
      {plan.firstLine && <p className="pkj-quote">{plan.firstLine}</p>}
    </div>,
    numbers: <div className="pkj-col">
      <Orb size={56} mood="focused" />
      {w.vol > 0
        ? <div className="pkj-stat"><span>{t('You moved')}</span><b>{fmtNum(w.vol)}</b><em>{t('{0} today.', unit)}</em></div>
        : <div className="pkj-stat"><span>{t('You did')}</span><b>{setsDone(w)}</b><em>{t('sets today.')}</em></div>}
      {diff != null && w.vol > 0 && <span className={'pkj-pill' + (diff > 0 ? ' up' : '')}>
        {diff > 0 ? t('{0} more than last {1}', fmtVol(diff, unit), w.name) : diff < 0 ? t('{0} less than last {1}', fmtVol(-diff, unit), w.name) : t('Same as last {0}', w.name)}
      </span>}
      <div className="pkj-tiles">
        <div><b>{Math.max(1, Math.round((w.end - w.start) / 60000))}</b><span>{t('min')}</span></div>
        <div><b>{setsDone(w)}</b><span>{t('sets')}</span></div>
        <div><b>{w.entries.length}</b><span>{t('exercises')}</span></div>
      </div>
    </div>,
    record: <div className="pkj-center">
      <Orb size={170} mood="celebrate" inverted />
      {prs.length > 0 && (() => {
        const id = prs[0], top = topSet(entryOf(id))
        return <div className="pkj-rec">
          <span className="eyebrow">{t('New best')}</span>
          <h1 className="pkj-h capitalize">{exName(id)}</h1>
          {top && <b className="mono">{nextSetLabel(entryOf(id), top, unit)}</b>}
          {prevBest[id] > 0 && <span className="was">{t('Old best: {0}', fmtNum(prevBest[id]) + ' ' + unit)}</span>}
        </div>
      })()}
      {[...prs.slice(1).map(id => ({ id, k: t('New best'), v: (() => { const tp = topSet(entryOf(id)); return tp ? nextSetLabel(entryOf(id), tp, unit) : '' })() })),
        ...e1prs.map(p => ({ id: p.id, k: t('Best estimated 1RM'), v: fmtNum(p.est) + ' ' + unit }))].map(r =>
        <div key={r.k + r.id} className="pkj-row dark"><span><em>{r.k}</em><b className="capitalize">{exName(r.id)}</b></span><span className="mono">{r.v}</span></div>)}
    </div>,
    skipped: <div className="pkj-col">
      <Orb size={72} mood="disappointed" />
      <h1 className="pkj-h">{t(left === 1 ? '{0} set left behind.' : '{0} sets left behind.', left)}</h1>
      <div className="pkj-list">{skipped.map(x => <div key={x.id} className="pkj-row"><b className="capitalize">{exName(x.id)}</b><span className="mono dim">{t(x.n === 1 ? '{0} set' : '{0} sets', x.n)}</span></div>)}</div>
    </div>,
    trained: <div className="pkj-col">
      <Orb size={56} mood="focused" />
      <h1 className="pkj-h">{worked.length ? t('{0} did most of the work.', t(MUSCLE_NAME[worked[0]] || worked[0])) : t("Here's what you trained.")}</h1>
      <div className="card pkj-map"><BodyMap load={loadOfWorkouts([w])} body={st.body} /></div>
    </div>,
    next: <div className="pkj-col">
      <Orb size={56} mood="curious" />
      <h1 className="pkj-h">{t("Here's what you'll lift next {0}.", plan.routine ? plan.routine.name : w.name)}</h1>
      <div className="pkj-list">{plan.rx.map(x => <div key={x.cfg.id} className="pkj-row">
        <span><b className="capitalize">{exName(x.cfg.id)}</b><em className={x.p.kind === 'up' ? 'up' : ''}>{rxWhy(x.p.kind)}</em></span>
        <span className="mono">{rxLabel(x)}</span>
      </div>)}</div>
      {plan.nextUp && <div className="pkj-row dark"><span className="dim">{t('Next session')}</span><b>{plan.nextUp.name} · {plan.nextUp.day}</b></div>}
    </div>,
    verdict: <div className="pkj-col pkj-verdict">
      <Orb size={200} mood={v.mood} inverted={theme === 'ink'} className="pkj-bigorb" />
      {v.line && <p className="pkj-quote">{v.line}</p>}
      {v.sub && <p className="pkj-subq">{v.sub}</p>}
    </div>,
    summary: <div className="pkj-col">
      <div className="pkj-sumh"><Orb size={64} mood={v.tone === 'bad' ? 'suspicious' : 'happy'} /><h1 className="pkj-h">{user ? t('Nice work, {0}.', user.name) : t('{0}, done.', w.name)}</h1></div>
      <div className="pkj-list">
        {w.vol > 0 && <div className="pkj-row"><span className="dim">{t('Volume')}</span><b>{fmtVol(w.vol, unit)}{diff > 0 && <em className="up"> +{fmtNum(diff)}</em>}</b></div>}
        <div className="pkj-row"><span className="dim">{t('Session')}</span><b>{line}</b></div>
        {prs.length > 0 && <div className="pkj-row"><span className="dim">{t('New best')}</span><b className="capitalize">{prs.map(exName).join(', ')}</b></div>}
        {worked.length > 0 && <div className="pkj-row"><span className="dim">{t('Most worked')}</span><b>{t(MUSCLE_NAME[worked[0]] || worked[0])}</b></div>}
        {plan.nextUp && <div className="pkj-row"><span className="dim">{t('Next up')}</span><b>{plan.nextUp.name} · {plan.nextUp.day}</b></div>}
      </div>
    </div>
  }[step]

  return <div className={'pkj ' + theme}>
    <div className="pkj-prog" aria-hidden="true">{steps.map((x, k) => <i key={x} className={k <= i ? 'on' : ''} />)}</div>
    <div className="pkj-top">
      <span>{t(STEP_LABEL[step])}</span>
      {step !== 'summary' && <button className="pkj-skip" onClick={() => setI(steps.length - 1)}>{t('Skip')}</button>}
    </div>
    <div className="pkj-body" key={step}>{body}</div>
    <div className="pkj-acts">
      {step === 'summary' ? <>
        <Button variant="primary" onClick={done}>{t('Done')}</Button>
        <Button variant="soft" onClick={share}>{t('Share')}</Button>
      </> : <button className="pkj-go" onClick={onward}>{i === 0 ? t('See how it went') : t('Continue')}</button>}
    </div>
  </div>
}
export function finishWorkout() {
  const A = S().active
  if (!A) return
  const done = setsDoneActive(A)
  const total = A.entries.reduce((n, e) => n + e.sets.length, 0)
  // Peek has an opinion about leaving sets behind (lib/peek, key moments)
  const cross = () => (getPeek().honesty === 'gentle' ? 'disappointed' : 'angry')
  if (!done) { confirmSheet({ title: t('Nothing logged yet'), message: t('You haven’t checked off any sets. Finish the workout anyway?'), confirmText: t('Finish anyway'), onConfirm: doFinishWorkout, peek: { mood: 'suspicious', line: sayNow('nothingLogged') } }); return }
  if (done < total) { confirmSheet({ title: t('Finish early?'), message: t(total - done === 1 ? '{0} set still unchecked. Finish the workout now?' : '{0} sets still unchecked. Finish the workout now?', total - done), confirmText: t('Finish workout'), onConfirm: doFinishWorkout, peek: { mood: total - done > 2 ? cross() : 'disappointed', line: sayNow('finishEarly', [total - done]) } }); return }
  doFinishWorkout()
}
// Everything Peek decides about the journey is decided once, as it opens — the store keeps
// changing underneath and the story shouldn't shift mid-read. Runs after the workout is
// saved, so "next time" is worked out from today's sets.
function journeyPlan(w, { prs, e1prs, early, left, prev, events }) {
  const st = S()
  const peek = getPeek()
  const routine = w.routineId ? st.routines.find(r => r.id === w.routineId) : null
  const rx = routine ? routine.ex.map(cfg => ({ cfg, p: nextPrescription(st, cfg, routine) }))
    .filter(x => x.p && x.p.kind !== 'off' && (x.p.weight > 0 || x.p.reps || x.p.sec)).slice(0, 4) : []
  let nextUp = null
  for (let k = 1; k <= 7 && !nextUp; k++) {
    const d = new Date(); d.setDate(d.getDate() + k)
    const r = effectiveRoutine(st, isoOf(d))
    if (r) nextUp = { name: r.name, day: t(DAYN[d.getDay()]) }
  }
  const diff = prev ? (w.vol || 0) - (prev.vol || 0) : null
  const opts = { stage: stageOf(peek.bond), honesty: peek.honesty, said: peek.said }
  const v = finishVerdict({ prNames: prs.map(exName), early, left, diff, prev: prev ? prev.vol || 0 : 0, diffText: diff > 0 ? fmtVol(diff, st.unit) : '', events }, Math.random, opts)
  let steps = journeySteps({ first: events.some(e => e.k === 'first'), prs, e1prs, early, diff, hasNext: rx.length > 0 })
  if (!peek.voice) steps = steps.filter(x => x !== 'verdict')
  else (v.keys || []).forEach(k => said({ key: k }))
  return { routine, rx, nextUp, v, steps, open: sayNow('finishOpen'), firstLine: steps.includes('first') ? sayNow('first') : null }
}

function doFinishWorkout() {
  const st = S()
  const A = st.active
  if (!A) return
  const prs = []
  const e1prs = []
  const prevBest = {}
  A.entries.forEach(e => {
    const mx = Math.max(0, ...e.sets.filter(s => s.done).map(s => s.w))
    const best = bestWeightFor(st, e.id)
    if (mx > 0 && mx > best) { prs.push(e.id); prevBest[e.id] = best }
    // A heavier estimate without a heavier top set is its own kind of progress —
    // same weight for more reps. Reported separately so it can't be read as a load PR.
    const rec = is1RMRecord(st, e.id, e)
    if (rec && !prs.includes(e.id)) e1prs.push({ id: e.id, ...rec })
  })
  const w = {
    id: A.id, d: A.d, start: A.start, end: Date.now(), routineId: A.routineId, name: A.name, bw: A.bw,
    // `target` (what the session prescribed) is kept alongside the sets: without it a
    // finished workout cannot say whether it hit its reps, and a timed session reads back
    // as "0 reps". It is what the progression engine works from.
    entries: A.entries.map(e => ({ id: e.id, sets: e.sets, topW: e.topW || null, target: e.target || null })).filter(e => e.sets.some(s => s.done)),
    prs
  }
  w.vol = workoutVolume(w)
  const done = setsDoneActive(A)
  const total = A.entries.reduce((n, e) => n + e.sets.length, 0)
  const early = done > 0 && done < total
  const skipped = A.entries.map(e => ({ id: e.id, n: e.sets.filter(s => !s.done).length })).filter(x => x.n > 0)
  const prev = previousSession(st.workouts, w)
  // Peek remembers the session (bond, moments) before the journey asks what it thinks
  const mem = afterWorkout(getPeek(), st, w, { early })
  update(s => {
    w.entries.forEach(e => {
      const mx = Math.max(0, ...e.sets.filter(x => x.done).map(x => x.w || 0), e.topW || 0)
      if (mx > 0) { const cur = s.exWeights[e.id]; if (!cur || mx > cur.w) s.exWeights[e.id] = { w: mx, d: w.d } }
    })
    s.workouts.push(w)
    s.active = null
    s.peek = mem.peek
  })
  useUI.getState().stopRest()
  beep(snd(), 880, 0.15); beep(snd(), 1100, 0.15, 0.18); beep(snd(), 1320, 0.3, 0.36)
  const plan = journeyPlan(w, { prs, e1prs, early, left: total - done, prev, events: mem.events })
  ui().openSheet(close => <FinishJourney w={w} prs={prs} prevBest={prevBest} e1prs={e1prs} left={total - done}
    skipped={skipped} prev={prev} plan={plan} close={close} />, { kind: 'full', locked: true })
}
