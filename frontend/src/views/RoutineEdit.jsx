import { useNavigate, useParams } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { useStore } from '../store/useStore.js'
import { exOr } from '../lib/exercises.js'
import { uid } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { supersetUnits, cleanupSg, moveItem, exLine, modeOf } from '../lib/history.js'
import { followsSuggestion, applySuggestion } from '../lib/scheme.js'
import { SchemePills } from '../components/Scheme.jsx'
import Orb from '../components/Orb.jsx'
import { Thumb } from '../components/Media.jsx'
import { glyphPicker, exercisePicker, exConfigSheet, confirmSheet, muscleLine } from '../sheets.jsx'
import { toast, ui } from '../sheets/common.jsx'
import Icon from '../components/Icon.jsx'
import { glyphOf } from '../lib/glyphs.js'
import { Button, Row, SelectRow } from '../components/ui.jsx'
import { POLICIES_FOR, POLICY_NAME, POLICY_DESC } from '../lib/progression.js'
import BodyMap from '../components/BodyMap.jsx'
import useDragReorder from '../components/useDragReorder.js'
import { loadOfRoutine, rankOf, MUSCLE_NAME } from '../lib/muscles.js'

// The routine editor is built from the same pieces as Home and Stats — white cards with a
// bold title, stat tiles, ink for what is selected, green only for the one main action — so
// it reads as part of the app rather than a settings form.

const routineOf = id => useStore.getState().S.routines.find(x => x.id === id)
const updateRoutine = (id, fn) => useStore.getState().update(s => { const r = s.routines.find(x => x.id === id); if (r) fn(r) })

// Peek's take on sets and reps for the profile's goal, while any exercise here differs from
// it. One tap rewrites them all (weights untouched); × hides it for this routine.
const GOAL_LINE = {
  muscle: 'For building muscle I’d do 6–8 reps on big lifts and 10–15 on the rest.',
  strength: 'For getting stronger I’d do 5 × 5 on big lifts and 8–12 reps on the rest.',
  fat: 'For losing fat I’d do 8–12 reps on big lifts and 12–15 on the rest.',
}
function PeekSuggest({ r, goal, edit, hide }) {
  if (!r.ex.length || r.hideSuggest || r.ex.every(e => followsSuggestion(e, exOr(e.id), goal))) return null
  return <div className="card rt-peek">
    <Orb size={36} poke="joyful-wide" />
    <div className="grow">
      <p>{t(GOAL_LINE[goal] || 'I’d do 3 sets of 8–12 reps on everything here.')}</p>
      <div className="row" style={{ gap: 4 }}>
        <button className="rt-act" onClick={() => edit(x => x.forEach((e, i) => { x[i] = applySuggestion(e, exOr(e.id), goal) }))}>{t('Apply to all')}</button>
        <button className="rt-act dim" onClick={hide}>{t('No thanks')}</button>
      </div>
    </div>
  </div>
}

// Six dots: the handle that says "this row moves". A tap opens the move options.
const Grip = () => <svg viewBox="0 0 12 18" width="12" height="18" aria-hidden="true">
  {[3, 9].map(x => [3, 9, 15].map(y => <circle key={x + '-' + y} cx={x} cy={y} r="1.6" fill="currentColor" />))}
</svg>

/* ---------- move / superset one exercise ---------- */
function MoveSheet({ id, i, close }) {
  const r = useStore(s => s.S.routines.find(x => x.id === id))
  if (!r || !r.ex[i]) return null
  const n = r.ex.length, e = r.ex[i]
  const linked = i > 0 && e.sg && r.ex[i - 1].sg === e.sg
  const go = to => { updateRoutine(id, x => moveItem(x.ex, i, to)); close() }
  const link = () => {
    updateRoutine(id, x => {
      const cur = x.ex[i], prev = x.ex[i - 1]
      if (cur.sg && prev.sg && cur.sg === prev.sg) delete cur.sg
      else { const gid = prev.sg || ('sg' + uid()); prev.sg = gid; cur.sg = gid }
      cleanupSg(x.ex)
    })
    close()
  }
  return <>
    <h3 className="capitalize">{exOr(e.id).n}</h3>
    <div className="sect-b">
      {i > 0 && <Row icon="arrowUp" iconTint="var(--ink, var(--label))" title={t('Move up')} onClick={() => go(i - 1)} />}
      {i < n - 1 && <Row icon="arrowDown" iconTint="var(--ink, var(--label))" title={t('Move down')} onClick={() => go(i + 1)} />}
      {i > 1 && <Row icon="chevronUp" iconTint="var(--ink, var(--label))" title={t('Move to the top')} onClick={() => go(0)} />}
      {i < n - 2 && <Row icon="chevronDown" iconTint="var(--ink, var(--label))" title={t('Move to the bottom')} onClick={() => go(n - 1)} />}
    </div>
    {i > 0 && <>
      <div style={{ height: 12 }} />
      <div className="sect-b">
        <Row icon="link" iconTint="var(--ink, var(--label))" title={linked ? t('Undo superset') : t('Superset with the one above')}
          subtitle={linked ? null : t('You’ll do them back-to-back.')} onClick={link} />
      </div>
    </>}
    <div style={{ height: 8 }} />
  </>
}
const moveSheet = (id, i) => ui().openSheet(close => <MoveSheet id={id} i={i} close={close} />)

/* ---------- routine settings: icon, progression, delete ---------- */
function deleteRoutine(id, done) {
  const r = routineOf(id)
  if (!r) return
  confirmSheet({
    title: t('Delete routine?'), message: t('“{0}” and its exercises will be removed.', r.name), confirmText: t('Delete'), danger: true,
    onConfirm: () => {
      useStore.getState().update(s => {
        s.routines = s.routines.filter(x => x.id !== id)
        Object.keys(s.week).forEach(k => { if (s.week[k] === id) delete s.week[k] })
        Object.keys(s.dayPlan).forEach(k => { if (s.dayPlan[k] === id) delete s.dayPlan[k] })
      })
      done()
    }
  })
}
function RoutineSettings({ id, close, onDeleted }) {
  const r = useStore(s => s.S.routines.find(x => x.id === id))
  if (!r) return null
  return <>
    <h3>{t('Routine settings')}</h3>
    <div className="sect-b">
      <Row icon={glyphOf(r.emoji)} title={t('Icon')} accessory="chevron"
        onClick={() => glyphPicker(r.emoji, g => updateRoutine(id, x => { x.emoji = g }))} />
      <SelectRow icon="chartLine" title={t('Progression')} sheetTitle={t('Progression')}
        value={r.prog || 'linear'} onChange={v => updateRoutine(id, x => { x.prog = v })}
        options={POLICIES_FOR.reps.map(p => ({ value: p, label: t(POLICY_NAME[p]), subtitle: t(POLICY_DESC[p]) }))} />
    </div>
    <div className="small dim" style={{ margin: '8px 4px 18px' }}>
      {t('Applies to every exercise in this routine that does not set its own rule.')}
    </div>
    <Button variant="plain" className="rt-del" icon="trash" onClick={() => { close(); deleteRoutine(id, onDeleted) }}>{t('Delete routine')}</Button>
  </>
}
const routineSettings = (id, onDeleted) => ui().openSheet(close => <RoutineSettings id={id} close={close} onDeleted={onDeleted} />)

export default function RoutineEdit() {
  const nav = useNavigate()
  const { id } = useParams()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const r = S.routines.find(x => x.id === id)
  const listRef = useRef(null)
  const drag = useDragReorder({ containerRef: listRef, onMove: (from, to) => updateRoutine(id, x => moveItem(x.ex, from, to)) })
  useEffect(() => { if (!r) nav('/plan') }, [!!r])
  if (!r) return null

  const edit = fn => update(s => { fn(s.routines.find(x => x.id === id).ex) })

  const openPicker = () => exercisePicker((ex, ctx) => exConfigSheet(ex, null, cfg => edit(x => { x.push({ id: ex.id, ...cfg }) }), null, r, ctx),
    { listOf: st => st.routines.find(x => x.id === id)?.ex, unique: true })

  const openRow = i => {
    const e = r.ex[i], ex = exOr(e.id)
    exConfigSheet(ex, e, cfg => edit(x => { x[i] = { id: x[i].id, sg: x[i].sg, ...cfg } }), () => edit(x => { x.splice(i, 1); cleanupSg(x) }), r, {
      list: r.ex,
      // Sets, reps and progression carry over; the load does not — 60 kg on a barbell
      // means nothing on dumbbells — and bodyweight re-derives from the new exercise.
      swap: alt => {
        edit(x => { const { weight, bodyweight, ...keep } = x[i]; x[i] = { ...keep, id: alt.id, weight: 0 } })
        toast(t('Swapped to “{0}”', alt.n))
      },
    })
  }

  const row = i => {
    const e = r.ex[i]
    // An unresolvable id is shown rather than skipped — hiding it left an entry you
    // could neither see nor delete, but that still turned up in the workout.
    const ex = exOr(e.id)
    // reps work is adjusted right on the row; holds and cardio keep their summary line
    const pills = modeOf(e) === 'reps' && !ex.missing
    // press and hold anywhere on the row to pick it up, as in an iOS list; a tap still opens it
    return <div key={i} className="rt-row" data-idx={i} {...drag.row(i)} onClick={() => { if (!drag.consumeClick()) openRow(i) }}>
      <Thumb ex={ex} />
      <div className="grow rt-main">
        <div className="tt capitalize">{ex.n}</div>
        <div className="ss">{pills ? muscleLine(ex) : exLine(e, S.unit)}</div>
      </div>
      {/* drag to reorder; a tap opens the same moves as a menu */}
      <button className="rt-grip" aria-label={t('Move')} {...drag.handle(i, r.ex.length)}
        onClick={ev => { ev.stopPropagation(); if (!drag.consumeClick()) moveSheet(id, i) }}><Grip /></button>
      {/* on a line of their own, under the name, so sets · reps · weight fit in one row */}
      {pills && <SchemePills cfg={e} unit={S.unit} onChange={cfg => edit(x => { x[i] = cfg })} />}
    </div>
  }

  const units = supersetUnits(r.ex)
  const load = loadOfRoutine(r)
  const { worked } = rankOf(load)
  const sets = r.ex.reduce((a, e) => a + (e.sets || 1), 0)

  return <div className="narrow redit">
    <div className="rt-top">
      <button className="iconbtn" onClick={() => nav('/plan')} aria-label={t('Plan')}><Icon name="chevronLeft" /></button>
      <button className="iconbtn" onClick={() => routineSettings(id, () => nav('/plan'))} aria-label={t('Routine settings')}><Icon name="gear" /></button>
    </div>

    <div className="rt-kicker"><Icon name={glyphOf(r.emoji)} />{t('Routine')}</div>
    {/* the name is the page title, edited in place; a fresh "New routine" is selected on
        focus so typing replaces it */}
    <input className="rt-title" defaultValue={r.name} aria-label={t('Routine name')} enterKeyHint="done"
      onFocus={e => { if (e.target.value === t('New routine')) e.target.select() }}
      onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
      onChange={e => update(s => { s.routines.find(x => x.id === id).name = e.target.value.trim() || t('Routine') })} />

    {r.ex.length > 0 && <div className="pk-tiles">
      <div className="pk-tile"><span>{t('Exercises')}</span><b>{r.ex.length}</b></div>
      <div className="pk-tile"><span>{t('Sets')}</span><b>{sets}</b></div>
      <div className="pk-tile"><span>{t('Focus')}</span><b>{worked[0] ? t(MUSCLE_NAME[worked[0]]) : '—'}</b></div>
    </div>}

    <PeekSuggest r={r} goal={S.goal} edit={edit} hide={() => update(s => { s.routines.find(x => x.id === id).hideSuggest = true })} />

    <div className="card rt-list" ref={listRef}>
      <div className="pk-card-h"><b>{t('Exercises')}</b></div>
      {r.ex.length ? units.map(u => u.length > 1
        ? <div key={'ss' + u[0]} className="rt-ss"><div className="rt-ss-l"><Icon name="link" />{t('Superset')}</div>{u.map(row)}</div>
        : row(u[0]))
        : <div className="rt-empty">{t('No exercises yet — add your first one.')}</div>}
      <Button variant="primary" onClick={openPicker} icon="plus">{t('Add exercise')}</Button>
    </div>

    {/* Coverage of the routine as planned, so a gap shows up while you're building it
        rather than after a month of training around it. */}
    {r.ex.length > 0 && <div className="card">
      <div className="pk-card-h" style={{ marginBottom: 8 }}><b>{t('What this session hits')}</b></div>
      <BodyMap load={load} body={S.body} />
      <div className="mchips">
        {worked.slice(0, 6).map(m => <span key={m} className="mchip">{t(MUSCLE_NAME[m])}</span>)}
      </div>
    </div>}

    <button className="pk-link rt-del" onClick={() => deleteRoutine(id, () => nav('/plan'))}>{t('Delete routine')}</button>
  </div>
}
