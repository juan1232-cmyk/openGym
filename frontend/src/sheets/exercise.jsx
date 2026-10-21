// Everything about one exercise: opening its screen (views/Exercise.jsx), adding it to a routine, its
// sets/reps/progression config, the exercise picker, and custom (user-created) exercises.
import { useState, useRef, lazy, Suspense } from 'react'
import { useStore } from '../store/useStore.js'
import { EXDB, EXIDX, BODYPARTS, isCardio, isBodyweightEq, allExercises } from '../lib/exercises.js'
import { searchExercises, browseOrder, usageOf, recentIds, regionOf, secondaryOf, muscleChips, matchesMuscle, suggestionFor, similarTo, gymFilter, wordsFrom, quickConfig } from '../lib/pick.js'
import { MUSCLE_NAME } from '../lib/muscles.js'
import Orb from '../components/Orb.jsx'
import { fmtDate, fmtNum, uid, exCount } from '../lib/format.js'
import { lastEntryFor, bestWeightFor, setLabel, defaultConfig, cleanupSg, modeOf, isBw, isPerSide, sideReps, repRangeOf } from '../lib/history.js'
import { withRepRange, suggestScheme } from '../lib/scheme.js'
import { SetsChips, RepsChips } from '../components/Scheme.jsx'
import { t, getLang } from '../lib/i18n.js'
import { nav } from '../lib/nav.js'
import { Thumb } from '../components/Media.jsx'
import Stepper from '../components/Stepper.jsx'
import Icon from '../components/Icon.jsx'
import { Button, Switch, Segmented, SelectRow, Row, Section } from '../components/ui.jsx'
import { glyphOf, DEFAULT_GLYPH } from '../lib/glyphs.js'
import { policyFor, defaultIncrement, nextPrescription, POLICIES_FOR, POLICY_NAME, POLICY_DESC } from '../lib/progression.js'
import { S, update, ui, toast, confirmSheet } from './common.jsx'

/* ============================ exercise screen ============================ */
// An exercise opens as its own screen (views/Exercise.jsx), not a sheet. Over an open sheet —
// the picker's info button, the config sheet's picture — a route change would land under it,
// so there the same screen comes up as a full-screen sheet instead, loaded on demand: a static
// import would tie this file and the view (which uses the sheets) into a cycle.
const ExerciseScreen = lazy(() => import('../views/Exercise.jsx').then(m => ({ default: m.ExerciseScreen })))
export function exerciseDetailSheet(ex, tab) {
  if (!ui().sheets.length) { nav('/exercise/' + ex.id + (tab ? '?tab=' + tab : '')); return }
  ui().openSheet(close => <Suspense fallback={null}><ExerciseScreen ex={ex} onBack={close} tab={tab} /></Suspense>,
    { kind: 'full', className: 'exsheet' })
}

/* ============================ add to routine ============================ */
function AddToRoutine({ ex, close }) {
  const st = useStore(s => s.S)
  const pick = rid => {
    close()
    const isNew = rid === '_new'
    exConfigSheet(ex, null, cfg => {
      update(s => {
        let r = isNew ? { id: uid(), name: t('New routine'), emoji: DEFAULT_GLYPH, ex: [] } : s.routines.find(x => x.id === rid)
        if (isNew) s.routines.push(r)
        if (r) r.ex.push({ id: ex.id, ...cfg })
      })
      const r = isNew ? S().routines[S().routines.length - 1] : st.routines.find(x => x.id === rid)
      toast(t('“{0}” added to {1}', ex.n, r ? r.name : t('routine')))
      if (isNew && r) nav('/plan/r/' + r.id)
    }, null, isNew ? null : st.routines.find(x => x.id === rid))
  }
  return <>
    <h3 className="capitalize">{t('Add “{0}”', ex.n)}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('Pick a routine — sets, reps & weight come next.')}</div>
    <div className="list">
      {st.routines.map(r => <div key={r.id} className="item" onClick={() => pick(r.id)}>
        <span className="lrow-i"><Icon name={glyphOf(r.emoji)} /></span>
        <div className="grow"><div className="tt">{r.name}</div><div className="ss">{exCount(r.ex.length)}</div></div>
        {r.ex.some(e => e.id === ex.id) && <span className="tag">{t('already in')}</span>}<Icon name="plus" className="chev" />
      </div>)}
      <div className="item" onClick={() => pick('_new')}><span className="lrow-i" style={{ background: 'var(--surface-3)' }}><Icon name="sparkles" /></span>
        <div className="grow"><div className="tt">{t('New routine')}</div><div className="ss">{t('Create one and start with this exercise')}</div></div><Icon name="plus" className="chev" /></div>
    </div>
  </>
}
export const addToRoutineSheet = ex => ui().openSheet(close => <AddToRoutine ex={ex} close={close} />)

/* ============================ custom exercises (issue #11) ============================ */
// Name + body part is all it takes — the exercise then behaves like any built-in one
// (planning, logging, PRs, stats), just without an animation.
function CustomExForm({ existing, prefill, onDone, close }) {
  const [n, setN] = useState(existing ? existing.n : (prefill || ''))
  const [bp, setBp] = useState(existing ? existing.bp : '')
  const [desc, setDesc] = useState(existing ? (existing.desc || '') : '')
  const save = () => {
    const name = n.trim()
    if (!name) { toast(t('Give it a name')); return }
    if (!bp) { toast(t('Pick a body part')); return }
    const dup = allExercises(S()).find(e => e.n.toLowerCase() === name.toLowerCase() && e.id !== (existing || {}).id)
    if (dup) { toast(t('“{0}” already exists', dup.n)); return }
    const d = desc.trim().slice(0, 1000)
    let id = existing && existing.id
    if (existing) update(s => { const c = (s.customEx || []).find(x => x.id === id); if (c) { c.n = name; c.bp = bp; c.desc = d } })
    else {
      id = 'c' + uid()
      update(s => { (s.customEx = s.customEx || []).push({ id, n: name, bp, desc: d, tg: '', eq: 'custom', custom: true }) })
    }
    close()
    toast(existing ? t('Saved') : t('“{0}” created', name))
    onDone && onDone(EXIDX[id])
  }
  return <>
    <h3>{existing ? t('Edit custom exercise') : t('Create your own exercise')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('Name it and pick a body part — it behaves like any other exercise, just without an animation.')}</div>
    <input className="input" placeholder={t('Exercise name')} value={n} onChange={e => setN(e.target.value)} />
    <div className="chips" style={{ margin: '12px 0' }}>
      {BODYPARTS.map(b => <button key={b} className={'chip' + (bp === b ? ' on' : '')} onClick={() => setBp(b)}>{t(b)}</button>)}
    </div>
    {bp === 'cardio' && <div className="small dim row" style={{ marginBottom: 10, gap: 5 }}><Icon name="figureRun" style={{ fontSize: 13 }} />{t('Cardio exercises log time + speed instead of weight × reps.')}</div>}
    <textarea className="input" rows={4} maxLength={1000} placeholder={t('Description (optional) — setup, cues, anything you want to remember')}
      value={desc} onChange={e => setDesc(e.target.value)} />
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={save}>{existing ? t('Save') : t('Create exercise')}</Button>
    {existing && <><div style={{ height: 8 }} /><Button variant="danger" icon="trash" onClick={() => { close(); deleteCustomEx(existing) }}>{t('Delete exercise')}</Button></>}
  </>
}
export const customExSheet = (existing, onDone, prefill) => ui().openSheet(close => <CustomExForm existing={existing} prefill={prefill} onDone={onDone} close={close} />)

export function deleteCustomEx(ex, afterDelete) {
  if (S().active?.entries.some(e => e.id === ex.id)) { toast(t('Finish your current workout first')); return }
  confirmSheet({
    title: t('Delete “{0}”?', ex.n),
    message: t('It will be removed from your routines. Already-logged workouts keep their sets.'),
    confirmText: t('Delete'), danger: true,
    onConfirm: () => {
      update(s => {
        s.customEx = (s.customEx || []).filter(x => x.id !== ex.id)
        s.routines.forEach(r => { r.ex = r.ex.filter(e => e.id !== ex.id); cleanupSg(r.ex) })
        // stamp the name into history entries so past workouts stay readable
        s.workouts.forEach(w => w.entries.forEach(e => { if (e.id === ex.id) e.n = ex.n }))
        delete s.exWeights[ex.id]
      })
      toast(t('Exercise deleted'))
      afterDelete && afterDelete()
    }
  })
}

/* ============================ exercise picker ============================ */
// The one thing a row says besides the name: which part of which muscle ("Upper chest").
export const muscleLine = ex => t(regionOf(ex) || ex.tg || ex.bp || '')
export const chipLabel = m => (m === 'cardio' ? t('Cardio') : t(MUSCLE_NAME[m]))

function PickRow({ ex, onPick, inList, icon = 'plus', onInfo, note }) {
  return <div className="item pick-row" onClick={() => onPick(ex)}>
    <Thumb ex={ex} /><div className="grow"><div className="tt capitalize">{ex.n}</div>
      <div className="ss">{muscleLine(ex)}{note ? <> · {note}</> : null}</div></div>
    {onInfo && <button className="pick-info" aria-label={t('How to')} onClick={e => { e.stopPropagation(); onInfo(ex) }}><Icon name="info" /></button>}
    <span className={'pick-mark' + (inList ? ' on' : '') + (note ? ' pre' : '')}><Icon name={inList ? 'check' : icon} /></span>
  </div>
}

// Muscle, kit and region names in the app's language, so "pectorales" or "mancuerna" finds
// an exercise in a Spanish UI. Cached per language — the search runs on every keystroke.
const extraCache = new Map()
const extraWords = ex => {
  const lang = getLang()
  if (lang === 'en') return null
  const key = lang + ':' + ex.id
  let w = extraCache.get(key)
  if (!w) {
    w = wordsFrom([t(ex.eq), t(ex.tg), t(ex.bp), t(regionOf(ex) || ''), ...(ex.sm || []).map(m => t(m))])
    extraCache.set(key, w)
  }
  return w
}

// A whole screen, not a sheet: a search field and one row of muscles that stay put, the list
// scrolling under them, and Done always in reach — at the top too, since the keyboard covers
// the bottom while you type. Without a search, what you already train comes first, then the
// staple lifts (lib/pick.js browseOrder).
// `listOf` reads the routine / workout being added to out of the live state, so the check
// marks keep up while the picker stays open under each config sheet.
// A tap opens the config sheet (sets, reps, weight) on top, and the picker stays open under
// it for the next one. With `unique` (a routine), what is already in the list is marked and
// can't be added a second time by accident; a workout may repeat an exercise.
function ExercisePicker({ onPick, close, listOf, unique }) {
  const st = useStore(s => s.S)
  const list = (listOf && listOf(st)) || []
  const inList = new Set(list.map(e => e.id))
  const [startCount] = useState(list.length)
  const [q, setQ] = useState('')
  const [mu, setMu] = useState('')          // '' = every muscle, else a muscle slug or 'cardio'
  const [shown, setShown] = useState(50)
  const [allKit, setAllKit] = useState(false)
  const inputRef = useRef(null)
  const reset = () => setShown(50)
  const all = allExercises(st)
  const searching = !!q.trim()
  const opts = { usage: usageOf(st), extraWords }
  const pool = all.filter(e => matchesMuscle(e, mu))
  const found = searching ? searchExercises(pool, q, opts) : browseOrder(pool, { recent: recentIds(st) })
  // The gym profile hides what you can't do there — with a way out while searching, so a
  // machine your gym lacks still turns up instead of looking like the app doesn't know it.
  const f = st.gymEq && !allKit ? gymFilter(found, st.gymEq) : found
  const hidden = found.length - f.length
  // Same way out for the muscle chip: "curl" with Chest still selected would say No match.
  const elsewhere = searching && mu ? searchExercises(all, q, opts).length - found.length : 0
  const added = Math.max(0, list.length - startCount)
  const pick = ex => onPick(ex, { list, retarget: alt => onPick(alt, { list: (listOf && listOf(S())) || [] }) })
  const tap = ex => {
    if (unique && inList.has(ex.id)) { toast(t('Already in this routine')); return }
    pick(ex)
  }
  // Scrolling the results is the moment the keyboard should get out of the way.
  const blur = () => { if (document.activeElement === inputRef.current) inputRef.current.blur() }
  return <div className="pick">
    <div className="pick-head"><div className="pick-col">
      <div className="pick-top">
        <button className="iconbtn" onClick={close} aria-label={t('Close')}><Icon name="chevronLeft" /></button>
        <h3>{t('Add exercise')}</h3>
        <button className="pick-done" onClick={close}>{t('Done')}</button>
      </div>
      <form className="search" role="search" onSubmit={e => { e.preventDefault(); inputRef.current?.blur() }}>
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
        {/* iOS would "correct" db, rdl and half-typed Spanish into other words */}
        <input ref={inputRef} className="input" type="search" placeholder={t('Search')} value={q}
          autoCorrect="off" autoCapitalize="none" autoComplete="off" spellCheck={false} enterKeyHint="search"
          onChange={e => { setQ(e.target.value); reset() }} />
        {q && <button type="button" className="search-x" aria-label={t('Clear')} onClick={() => { setQ(''); reset() }}><Icon name="xmark" /></button>}
      </form>
      <div className="chips">
        <button className={'chip nocap' + (!mu ? ' on' : '')} onClick={() => { setMu(''); reset() }}>{t('All')}</button>
        {muscleChips(all).map(m => <button key={m} className={'chip' + (mu === m ? ' on' : '')} onClick={() => { setMu(m); reset() }}>{chipLabel(m)}</button>)}
      </div>
    </div></div>
    <div className="pick-list" onTouchStart={blur}><div className="pick-col">
      <div className="list">
        {f.slice(0, shown).map(e => <PickRow key={e.id} ex={e} onPick={tap} inList={inList.has(e.id)} onInfo={exerciseDetailSheet}
          note={unique && inList.has(e.id) ? t('already in') : null} />)}
        {f.length === 0 && <div className="empty">{t('No match')}</div>}
        {elsewhere > 0 && <button className="pk-link" onClick={() => { setMu(''); reset() }}>{t('Show {0} matches in all muscles', elsewhere)}</button>}
        {searching && hidden > 0 && <button className="pk-link" onClick={() => setAllKit(true)}>{t('Show {0} more for other gyms', hidden)}</button>}
        <div className="item" onClick={() => customExSheet(null, ex => tap(ex), q.trim())}>
          <div className="thumb thumb-x"><Icon name="plus" /></div>
          <div className="grow"><div className="tt">{searching ? t('Create “{0}”', q.trim()) : t('Create your own exercise')}</div></div>
        </div>
      </div>
      {f.length > shown && <><div style={{ height: 8 }} /><Button variant="soft" onClick={() => setShown(s => s + 50)}>{t('Show more')}</Button></>}
    </div></div>
    <div className="pick-foot"><div className="pick-col">
      <Button variant="primary" onClick={close}>{added ? t('Done · {0}', exCount(added)) : t('Done')}</Button>
    </div></div>
  </div>
}
// `opts.listOf(state)` → the [{ id }] being added to; `opts.unique` → no duplicates (see above).
export const exercisePicker = (onPick, opts = {}) =>
  ui().openSheet(close => <ExercisePicker onPick={onPick} close={close} listOf={opts.listOf} unique={opts.unique} />, { kind: 'full', className: 'picker' })

/* ============================ my gym's equipment ============================ */
// Every kind of kit in the catalogue, most exercises first, so the list reads "barbell,
// dumbbell, cable…" before the one-off tire and hammer.
const KIT_ALL = (() => {
  const c = {}
  EXDB.forEach(e => { c[e.eq] = (c[e.eq] || 0) + 1 })
  return Object.keys(c).filter(k => k !== 'body weight').sort((a, b) => c[b] - c[a]).map(k => ({ eq: k, n: c[k] }))
})()
export const gymEqLabel = gymEq => (gymEq ? t('{0} of {1}', gymEq.length, KIT_ALL.length) : t('All'))

function GymEquipment() {
  const gymEq = useStore(s => s.S.gymEq)
  const on = k => !gymEq || gymEq.includes(k)
  // Stored as the list you have; ticking everything back stores null, so "all" stays the
  // plain default rather than a list that quietly misses kit a future dataset adds.
  const set = list => update(s => { s.gymEq = list.length >= KIT_ALL.length ? null : list })
  const toggle = (k, v) => set(v ? [...(gymEq || []), k] : KIT_ALL.map(x => x.eq).filter(x => x !== k && on(x)))
  return <>
    <h3>{t('My gym’s equipment')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('The exercise picker hides what your gym can’t do. Bodyweight and your own exercises always show.')}</div>
    <div className="row" style={{ gap: 8, marginBottom: 12 }}>
      <Button size="sm" variant="tinted" onClick={() => set(KIT_ALL.map(x => x.eq))}>{t('Select all')}</Button>
      <Button size="sm" onClick={() => update(s => { s.gymEq = [] })}>{t('Bodyweight only')}</Button>
    </div>
    <Section>
      {KIT_ALL.map(({ eq, n }) => <Row key={eq} title={<span className="capitalize">{t(eq)}</span>} subtitle={exCount(n)}>
        <Switch checked={on(eq)} onChange={v => toggle(eq, v)} />
      </Row>)}
    </Section>
  </>
}
export const gymEquipmentSheet = () => ui().openSheet(() => <GymEquipment />)

/* ============================ swap for similar ============================ */
// Same main muscle, different exercise — for when the rack is taken, or a lift stops
// agreeing with you. Closest movement first ("barbell bench press" → "dumbbell bench press").
function SwapPicker({ ex, exclude, onSwap, close }) {
  const st = useStore(s => s.S)
  const f = similarTo(ex, allExercises(st), { exclude, gymEq: st.gymEq, usage: usageOf(st) }).slice(0, 30)
  return <>
    <h3>{t('Swap for')}</h3>
    <div className="list">
      {f.map(e => <PickRow key={e.id} ex={e} icon="shuffle" onPick={alt => { close(); onSwap(alt) }} />)}
      {f.length === 0 && <div className="empty">{t('No match')}</div>}
    </div>
  </>
}
// `exclude` = ids already in the routine/workout, so a swap never makes a duplicate.
export const swapSheet = (ex, exclude, onSwap) => ui().openSheet(close => <SwapPicker ex={ex} exclude={exclude} onSwap={onSwap} close={close} />)

/* ============================ Peek: overlap ============================ */
// A third exercise for the exact same part of a muscle is usually the same lift twice in
// different clothes. Peek says so in one line and offers something the list is missing —
// it never blocks the add.
function PeekOverlap({ ex, ctx, close }) {
  const st = useStore(s => s.S)
  const sug = suggestionFor(ctx.list, ex.id, allExercises(st), { gymEq: st.gymEq, usage: usageOf(st) })
  if (!sug) return null
  const { overlap, ex: alt } = sug
  return <div className="pk-coach pk-overlap">
    <Orb size={44} inverted poke="surprised-left" />
    <div className="grow">
      <p>{t('You already have {0} exercises for {1}.', overlap.ids.length, t(overlap.region).toLowerCase())}
        {alt && <> {t('Try')} <b className="capitalize">{alt.n}</b> {t('instead.')}</>}</p>
      {alt && <Button size="sm" variant="primary" onClick={() => { close(); ctx.retarget(alt) }}>{t('Use this instead')}</Button>}
    </div>
  </div>
}

/* ============================ exercise config ============================ */
// Progression settings for one exercise (issue #17). Shown inside the config sheet because
// "how does this lift go up" belongs next to sets and reps, not in a separate screen. Left
// on "follow the routine" it inherits, so most people never touch it.
function ProgressionFields({ ex, mode, c, setC, routine, unit }) {
  const options = POLICIES_FOR[mode] || ['off']
  if (options.length < 2) return null
  const inherited = policyFor({ id: ex.id }, routine, mode)
  const active = policyFor({ ...c, id: ex.id }, routine, mode)
  const inc = c.inc > 0 ? c.inc : (mode === 'time' ? 5 : defaultIncrement(ex.id, unit))
  return <>
    <h4 className="sec">{t('Progression')}</h4>
    <div className="sect-b" style={{ marginBottom: 8 }}>
      <SelectRow title={t('Rule')} sheetTitle={t('Progression')} value={c.prog || ''} onChange={v => setC(x => ({ ...x, prog: v || undefined }))}
        options={[{ value: '', label: t('Follow the routine ({0})', t(POLICY_NAME[inherited])) },
          ...options.map(p => ({ value: p, label: t(POLICY_NAME[p]) }))]} />
    </div>
    <div className="small dim" style={{ marginBottom: active === 'off' ? 18 : 10 }}>{t(POLICY_DESC[active])}</div>
    {active !== 'off' && <div className="row cfgrow" style={{ marginBottom: 18 }}>
      <Stepper label={mode === 'time' ? t('Step (seconds)') : t('Step ({0})', unit)} value={inc}
        step={mode === 'time' ? 5 : 1.25} decimal={mode !== 'time'} onChange={v => setC(x => ({ ...x, inc: v }))} />
    </div>}
    {/* Only double progression has a "top of the range" for a reserve to qualify — the other
        rules add weight on the reps alone. Unrated sets always pass, so this is safe to set
        before effort is switched on. */}
    {active === 'double' && <>
      <div className="cfg-lbl">{t('Reps in reserve at the top')}</div>
      <Segmented className="seg-range" value={c.rir != null ? c.rir : ''} onChange={v => setC(x => ({ ...x, rir: v === '' ? undefined : v }))}
        options={[{ value: '', label: t('Any') }, ...[1, 2, 3].map(n => ({ value: n, label: String(n) }))]} />
      <div className="small dim" style={{ marginBottom: 18 }}>{c.rir != null
        ? t('The weight goes up only once every set reaches the top of the range with {0} or more reps left.', c.rir)
        : t('The weight goes up on the reps alone, however hard the sets were.')}</div>
    </>}
  </>
}

// The top of the config sheet: what the lift is and what it trains, small enough that sets
// and reps are on screen without scrolling. The animation and how-to are one tap away on the
// thumbnail, not a 320px block in the way of every add.
function ConfigHead({ ex }) {
  const also = secondaryOf(ex).slice(0, 2).map(m => t(MUSCLE_NAME[m]).toLowerCase())
  return <div className="cfg-head">
    <button className="cfg-thumb" onClick={() => exerciseDetailSheet(ex)} aria-label={t('How to')}><Thumb ex={ex} /></button>
    <div className="grow">
      <h3 className="capitalize">{ex.n}</h3>
      <div className="ss">{muscleLine(ex)}{ex.eq && ex.eq !== 'custom' ? <> · <span className="capitalize">{t(ex.eq)}</span></> : null}</div>
      {also.length > 0 && <div className="ss">{t('Also works {0}', also.join(', '))}</div>}
    </div>
  </div>
}

// Your own numbers for this lift, which say more than any default: the last session, the
// best, and what progression will ask for next — or, before the first log, that there is
// nothing yet and the first session sets the baseline.
function HistoryStrip({ ex, cfg, routine }) {
  const st = useStore(s => s.S)
  const last = lastEntryFor(st, ex.id)
  if (!last) return <div className="cfg-new"><Icon name="sparkles" />{t('New to you — your first session sets the baseline.')}</div>
  const best = bestWeightFor(st, ex.id)
  const next = nextPrescription(st, { ...cfg, id: ex.id }, routine)
  return <>
    <div className="cfg-hist">
      <div className="pk-tile"><span>{t('Last time')} · {fmtDate(last.d)}</span><b>{last.sets.map(x => setLabel(ex.id, x, last.target)).join(', ')}</b></div>
      <div className="pk-tile"><span>{t('Best')}</span><b>{best > 0 ? <>{fmtNum(best)} <small>{st.unit}</small></> : '—'}</b></div>
    </div>
    {next && next.why && <div className="cfg-next"><Icon name="chartLine" />{t(...next.why)}</div>}
  </>
}

// `ctx` comes from the caller: { list } is what is being added to (for Peek's overlap
// check), { retarget } re-runs the add with another exercise, { swap } replaces this one.
function ExConfig({ ex, existing, onSave, onDelete, close, routine, ctx }) {
  const st = useStore(s => s.S)
  const cardio = isCardio(ex.id)
  // A new exercise starts on what Peek would suggest for the profile's goal, so most of the
  // time adding one is just "Add to routine".
  const [c, setC] = useState(() => existing || quickConfig(ex, st, routine && routine.id))
  // Once the lift is logged, a session starts from what was last lifted (buildSets), so a
  // planned weight only matters before that — it moves under More options then.
  const logged = !!lastEntryFor(st, ex.id)
  const sug = suggestScheme(st.goal, ex, { ...c, id: ex.id })
  // Everything most adds never touch lives behind "More options"; an exercise already set up
  // as a timed hold opens with it showing, since the Reps/Time switch is in there.
  const [more, setMore] = useState(() => !!existing && modeOf({ ...existing, id: ex.id }) === 'time')
  // Cardio keeps its own duration+speed form; the reps/time choice (issue #16) is offered for
  // everything else, which is where the gap was — planks, hangs, wall sits, loaded carries.
  const mode = cardio ? 'cardio' : modeOf({ ...c, id: ex.id })
  // Both default from the dataset and are then whatever the config says — see isBw.
  const bw = !cardio && isBw({ ...c, id: ex.id })
  const perSide = isPerSide(c)
  // Keep whatever the other mode already had (sets, weight) and fill only what is missing.
  const setMode = m => setC(x => ({ ...defaultConfig(ex.id, m), ...x, mode: m }))
  const save = () => {
    close()
    const sets = Math.max(1, Math.round(c.sets) || (cardio ? 1 : 3))
    // Only carry progression settings that differ from the inherited default, so a plan file
    // stays readable and "follow the routine" keeps meaning exactly that.
    const prog = {}
    if (c.prog) prog.prog = c.prog
    if (c.inc > 0) prog.inc = c.inc
    // Only kept while the lift is on double progression — left behind on another rule it
    // would come back unasked the day the rule is switched back.
    if (c.rir != null && mode === 'reps' && policyFor({ ...c, id: ex.id }, routine, mode) === 'double') prog.rir = c.rir
    // Written only when it differs from what the dataset already says, so a barbell config
    // stays exactly the shape it was before these flags existed.
    // `bodyweight` is true of a hold as much as of a set of reps; `side` is not — it counts
    // reps, and a timed hold has none. Switching an exercise to Time therefore drops it
    // rather than carrying a flag nothing downstream can read.
    const flags = {}
    if (bw !== isBodyweightEq(ex.id)) flags.bodyweight = bw
    if (cardio) onSave({ sets, min: Math.max(1, Math.round(c.min) || 20), speed: Math.max(0, c.speed || 8) })
    else if (mode === 'time') onSave({ sets, mode: 'time', sec: Math.max(1, Math.round(c.sec) || 45), weight: Math.max(0, c.weight || 0), ...flags, ...prog })
    else {
      // The range goes through withRepRange, which knows which fields carry it (repsMin for
      // a loaded lift, repsMax for bodyweight) and keeps a per-side total even.
      const { lo, hi } = repRangeOf({ ...c, id: ex.id })
      const base = { id: ex.id, sets, mode: 'reps', reps: c.reps, weight: Math.max(0, c.weight || 0), ...flags, ...(perSide ? { side: true } : {}), ...prog }
      const { id, ...out } = withRepRange(base, lo || 10, hi || lo || 10)
      onSave(out)
    }
  }
  return <>
    <ConfigHead ex={ex} />
    {!existing && ctx && ctx.retarget && <PeekOverlap ex={ex} ctx={ctx} close={close} />}
    {ex.desc && <div className="exnote">{ex.desc}</div>}
    <HistoryStrip ex={ex} cfg={c} routine={routine} />
    {mode === 'reps' ? <>
      {/* the two things nearly every add changes, one tap each */}
      <div className="cfg-lbl">{t('Sets')}</div>
      <SetsChips value={c.sets} suggested={sug && sug.sets} onPick={n => setC(x => ({ ...x, sets: n }))} />
      <div className="cfg-lbl">{t('Reps')}</div>
      <RepsChips cfg={{ ...c, id: ex.id }} suggested={sug && [sug.lo, sug.hi]} onPick={(lo, hi) => setC(x => { const { id, ...y } = withRepRange({ ...x, id: ex.id }, lo, hi); return y })} />
      {sug && <div className="cfg-sug"><i />{t('Suggested for your goal')}</div>}
      {!bw && !logged && <div className="row cfgrow" style={{ margin: '16px 0 18px' }}>
        <Stepper label={t('Starting weight ({0})', st.unit)} value={c.weight} step={2.5} onChange={v => setC(x => ({ ...x, weight: v }))} />
      </div>}
      {(bw || logged) && <div style={{ height: 18 }} />}
    </> : <div className="row cfgrow" style={{ marginBottom: mode === 'time' ? 8 : 18 }}>
      {cardio ? <>
        <Stepper label={t('Intervals')} value={c.sets} step={1} decimal={false} onChange={v => setC(x => ({ ...x, sets: v }))} />
        <Stepper label={t('Minutes')} value={c.min} step={1} decimal={false} onChange={v => setC(x => ({ ...x, min: v }))} />
        <Stepper label={t('Speed (km/h)')} value={c.speed} step={0.5} onChange={v => setC(x => ({ ...x, speed: v }))} />
      </> : <>
        <Stepper label={t('Sets')} value={c.sets} step={1} decimal={false} onChange={v => setC(x => ({ ...x, sets: v }))} />
        <Stepper label={t('Seconds')} value={c.sec} step={5} decimal={false} onChange={v => setC(x => ({ ...x, sec: v }))} />
        <Stepper label={t('Weight ({0})', st.unit)} value={c.weight} step={2.5} onChange={v => setC(x => ({ ...x, weight: v }))} />
      </>}
    </div>}
    {mode === 'time' && !bw && <div className="small dim" style={{ marginBottom: 18 }}>
      {t('A timer runs while you hold the set. Leave the weight at 0 for bodyweight holds.')}
    </div>}
    {!cardio && <button className="cfg-more" onClick={() => setMore(v => !v)} aria-expanded={more}>
      <span>{t('More options')}</span><Icon name={more ? 'chevronUp' : 'chevronDown'} />
    </button>}
    {!cardio && more && <div className="cfg-more-b">
      <div style={{ marginBottom: 14 }}>
        <Segmented className="seg-range" value={mode} onChange={setMode}
          options={[{ value: 'reps', label: t('Reps') }, { value: 'time', label: t('Time') }]} />
      </div>
      {/* ---------- bodyweight + per side (issues #31/#32/#33) ---------- */}
      <div className="sect-b" style={{ marginBottom: 8 }}>
        <Row icon="figureStrength" iconTint="var(--acc)" title={t('Bodyweight')}
          subtitle={bw ? t('No weight to enter — just log the reps.') : t('Ask for a weight on every set.')}>
          <Switch checked={bw} onChange={v => setC(x => ({ ...x, bodyweight: v, weight: v ? 0 : x.weight }))} />
        </Row>
        {mode === 'reps' && <Row icon="shuffle" iconTint="var(--blue)" title={t('Reps per side')}
          subtitle={perSide ? t('You still log the total: {0} is {1} per side.', c.reps || 0, fmtNum(sideReps(c.reps))) : t('For lunges, single-arm rows and the like.')}>
          {/* Turning it on rounds the target up to an even number, since half of an odd
              total is a rep one side does not get. */}
          <Switch checked={perSide} onChange={v => setC(x => ({ ...x, side: v || undefined, reps: v ? Math.ceil((x.reps || 0) / 2) * 2 : x.reps }))} />
        </Row>}
      </div>
      {mode === 'reps' && !bw && logged && <>
        <div className="row cfgrow" style={{ marginBottom: 8 }}>
          <Stepper label={t('Planned weight ({0})', st.unit)} value={c.weight} step={2.5} onChange={v => setC(x => ({ ...x, weight: v }))} />
        </div>
        <div className="small dim" style={{ marginBottom: 18 }}>{t('Each session starts from what you last lifted, so this is only a fallback.')}</div>
      </>}
      {/* A stepper is too wide to sit in a list row next to a label — it squeezes the text to
          one word per line — so added weight gets the same full-width treatment as sets and
          reps, with its explanation underneath. */}
      {bw && <>
        <div className="row cfgrow" style={{ marginBottom: 8 }}>
          <Stepper label={t('Added ({0})', st.unit)} value={c.weight || 0} step={2.5}
            onChange={v => setC(x => ({ ...x, weight: v }))} />
        </div>
        <div className="small dim" style={{ marginBottom: 18 }}>
          {t('For dips or pull-ups with a belt. Progression then follows the weight.')}
        </div>
      </>}
      <ProgressionFields ex={ex} mode={mode} c={c} setC={setC} routine={routine} unit={st.unit} />
    </div>}
    {!cardio && !more && <div style={{ height: 14 }} />}
    <Button variant="primary" onClick={save}>{existing ? t('Save') : (ctx && ctx.verb) || t('Add to routine')}</Button>
    {/* the secondary moves side by side, quieter than Save — Remove is a word, not a block */}
    {(existing && ctx && ctx.swap || onDelete) && <div className="cfg-acts">
      {existing && ctx && ctx.swap && <Button variant="soft" icon="shuffle" onClick={() => { close(); swapSheet(ex, (ctx.list || []).map(e => e.id), ctx.swap) }}>{t('Swap for similar')}</Button>}
      {onDelete && <Button variant="plain" className="cfg-remove" onClick={() => { close(); onDelete() }}>{t('Remove from routine')}</Button>}
    </div>}
    {ex.custom && <><div style={{ height: 8 }} /><Button variant="plain" icon="pencil" onClick={() => { close(); customExSheet(ex) }}>{t('Edit or delete this exercise')}</Button></>}
  </>
}
export const exConfigSheet = (ex, existing, onSave, onDelete, routine, ctx) => ui().openSheet(close => <ExConfig ex={ex} existing={existing} onSave={onSave} onDelete={onDelete} routine={routine} ctx={ctx} close={close} />)
