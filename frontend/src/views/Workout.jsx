import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { exOr } from '../lib/exercises.js'
import { effectiveRoutine, lastEntryFor, bestWeightFor, buildSets, setsDoneActive, workoutVolume, supersetUnits, unitOf, setLabel, modeOf, isBw, isPerSide, sideReps, repStep, EFFORT, effortOf, stepEffort, capEffort } from '../lib/history.js'
import { fmtNum, fmtVol, fmtDate, todayISO, exCount, DAYN } from '../lib/format.js'
import { beep, vibrate } from '../lib/sound.js'
import { t } from '../lib/i18n.js'
import { api } from '../lib/api.js'
import Media from '../components/Media.jsx'
import { startFlow, exercisePicker, exConfigSheet, exerciseDetailSheet, topWeightSheet, finishWorkout, workoutCompleteSheet, confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import KeyBar from '../components/KeyBar.jsx'
import SetToast from '../components/SetToast.jsx'
import { Button, Check, NumberField } from '../components/ui.jsx'
import { nextPrescription, applyPrescription } from '../lib/progression.js'
import { glyphOf } from '../lib/glyphs.js'
import { useKeyboardInset } from '../lib/keyboard.js'

/* ---------- start chooser (no active workout) ---------- */
function StartChooser() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const todayR = effectiveRoutine(S, todayISO())
  const todayOvr = S.dayPlan[todayISO()] !== undefined
  const others = S.routines.filter(r => r !== todayR)
  return <div className="narrow">
    <div className="hdr"><div><h1>{t('Start workout')}</h1><div className="sub">{t(DAYN[new Date().getDay()])} — {todayR ? t('today is {0}', todayR.name) : t('rest day, but no one’s stopping you')}</div></div></div>
    {todayR && <div className="card" style={{ borderColor: 'var(--acc)' }}>
      <h2 className="accent">{t("Today's plan")}{todayOvr ? ' · ' + t('rescheduled') : ''}</h2>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div><div className="big">{todayR.name}</div><div className="muted small">{exCount(todayR.ex.length)}</div></div>
        <span className="lrow-i" style={{ width: 38, height: 38, borderRadius: 9, fontSize: 22 }}><Icon name={glyphOf(todayR.emoji)} /></span>
      </div>
      <Button variant="primary" icon="play" onClick={() => startFlow(todayR.id)}>{t('Start {0}', todayR.name)}</Button>
    </div>}
    {others.length > 0 && <><h4 className="sec">{t('Other routines')}</h4>
      <div className="list">{others.map(r => <div key={r.id} className="item" onClick={() => startFlow(r.id)}>
        <span className="lrow-i"><Icon name={glyphOf(r.emoji)} /></span>
        <div className="grow"><div className="tt">{r.name}</div><div className="ss">{exCount(r.ex.length)}</div></div>
        <span className="tag acc">{t('Start')}</span></div>)}</div></>}
    <div style={{ height: 14 }} />
    <Button icon="shuffle" onClick={() => startFlow(null)}>{t('Freestyle workout (pick as you go)')}</Button>
    {!S.routines.length && <><div style={{ height: 10 }} /><Button variant="primary" onClick={() => nav('/plan')}>{t('Build a plan first')}</Button></>}
  </div>
}

/* ---------- elapsed clock (isolated so the workout tree doesn't re-render every second) ---------- */
function Elapsed({ start }) {
  const [t, setT] = useState('0:00')
  useEffect(() => {
    const tick = () => { const s = Math.floor((Date.now() - start) / 1000); setT(Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')) }
    tick(); const iv = setInterval(tick, 1000); return () => clearInterval(iv)
  }, [start])
  return <span>{t}</span>
}

/* ---------- volume readout (counts up to a new total and pulses briefly, isolated for the
   same reason Elapsed above is: the tween needs a state update on every animation frame, and
   that has no business re-rendering the whole set list) ---------- */
function VolumeReadout({ value, unit }) {
  const shown = useRef(value)
  const raf = useRef(null)
  const pulseT = useRef(null)
  const prevValue = useRef(value)
  const [, force] = useState(0)
  const [pulse, setPulse] = useState(false)
  useEffect(() => {
    if (value === prevValue.current) return
    prevValue.current = value
    cancelAnimationFrame(raf.current)
    clearTimeout(pulseT.current)
    setPulse(true)
    pulseT.current = setTimeout(() => setPulse(false), 420)
    // Counts toward the target instead of snapping — the number is the one piece of feedback
    // that says "that set counted", so it should be seen moving, same as the mock's own tween.
    const step = () => {
      const diff = value - shown.current
      if (Math.abs(diff) < 0.6) { shown.current = value; force(n => n + 1); return }
      shown.current += diff * 0.16
      force(n => n + 1)
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
  }, [value])
  useEffect(() => () => { cancelAnimationFrame(raf.current); clearTimeout(pulseT.current) }, [])
  return <span className={'vol' + (pulse ? ' pulse' : '')}>{fmtVol(Math.round(shown.current), unit)}</span>
}

/* ---------- one exercise block (reps: weight×reps · time: a held duration · cardio: duration+speed) ---------- */
function ExerciseBlock({ entryIdx, compact, showName, focus, justLogged, onToggle, onField, onFocusCell, onBlurCell, onAddSet, onRemoveSet, onStartTimed }) {
  const S = useStore(s => s.S)
  const working = useUI(s => s.work)
  const entry = S.active.entries[entryIdx]
  const ex = exOr(entry.id)
  const mode = modeOf({ ...(entry.target || {}), id: entry.id })
  const cardio = mode === 'cardio'
  const timed = mode === 'time'
  const last = lastEntryFor(S, entry.id)
  // The same number the "confirm your working weight" sheet calls your best, so the two
  // never disagree inside one session: heaviest logged set, or the working weight you kept.
  const best = cardio ? 0 : Math.max(bestWeightFor(S, entry.id), (S.exWeights[entry.id] || {}).w || 0)
  // What the progression policy decided for this session, and why (issue #17). Computed when
  // the session was built so the reason matches the numbers already in the rows.
  const plan = entry.plan
  // A bodyweight set has no weight to type, so the column is not there (issue #32) — one
  // field instead of two, which is the whole point of the flag. Adding a belt weight in the
  // config brings it back, now labelled as the addition it is.
  const cfg = { ...(entry.target || {}), id: entry.id }
  const bw = !cardio && isBw(cfg)
  const added = bw && entry.sets.some(s => s.w > 0)
  // `sh` is what the column header shows and `hd` what the keyboard bar shows. They differ
  // because the header has one column's width to say it in and the bar has most of a screen.
  // `fr` is the design's own column weight — KG wider than REPS (1.1 vs .88) because it's
  // typed most often (design_handoff_active_workout/README.md) — kept even when this column
  // isn't literally KG (cardio's duration, a timed hold's seconds) since it sits in the same
  // visual slot.
  const loadCol = { f: 'w', step: 2.5, dec: true, fr: 1.1, hd: bw ? t('Added ({0})', S.unit) : t('Weight ({0})', S.unit), sh: bw ? '+' + S.unit : S.unit }
  // The reps column is the total in every mode, unilateral included — the bar's +/- walks in
  // twos there so the number you land on is one you can actually split evenly.
  const repCol = { f: 'r', step: repStep(cfg), dec: false, fr: .88, hd: t('Reps'), sh: t('Reps') }
  const col1 = cardio ? { f: 'min', step: 1, dec: false, fr: 1.1, hd: t('Duration (min)'), sh: t('Min') }
    : timed ? { f: 'sec', step: 5, dec: false, fr: 1.1, hd: t('Seconds'), sh: t('Sec') }
      : (bw && !added) ? repCol : loadCol
  const col2 = cardio ? { f: 'speed', step: 0.5, dec: true, fr: .88, hd: t('Speed (km/h)'), sh: 'km/h' }
    : timed ? ((bw && !added) ? null : loadCol)
      : (bw && !added) ? null : repCol
  // Effort (RIR or RPE, whichever the profile logs) only makes sense for weighted rep sets,
  // not cardio/timed holds, and is opt-in since it adds a third field to every row. `opt`
  // because an unlogged effort is not the same as 0 — RIR 0 says the set went to failure. Not
  // part of the design — its own README says an RPE column "was designed and then cut" — kept
  // because removing a real, tested feature to match a mock that never modelled it would be a
  // regression, not fidelity; narrower than REPS since its values are always one or two digits.
  const kind = effortOf(S)
  const eff = EFFORT[kind]
  const col3 = mode === 'reps' && eff ? { ...eff, eff: kind, dec: true, opt: true, fr: .75, hd: t(eff.hd), sh: t(eff.hd) } : null
  const cols = [col1, col2, col3].filter(Boolean)
  // One grid template drives the header and every row, so the columns cannot drift apart when
  // a mode adds or drops one: bodyweight loses the load column, effort adds a third, a timed
  // set gains a start button. Building it here beats a class per combination — there are ten.
  // 30px/40px SET and ✓ columns are the design's own numbers; a timed set's start button reuses
  // the ✓ column's width since the design never had a fifth column to size it against.
  const grid = ['30px', 'minmax(0,1fr)', ...cols.map(c => `minmax(0,${c.fr}fr)`), ...(timed ? ['40px'] : []), '40px'].join(' ')

  // Last session's matching set, shown per row rather than as one line above the table: it is
  // only worth anything next to the cell you are about to type into, where it can be compared
  // without having to be remembered.
  const prevSet = i => (last && last.sets[i]) || null
  const prevTxt = i => { const p = prevSet(i); return p ? setLabel(entry.id, p, last.target) : '—' }
  // The same value as the field's placeholder, so an untouched cell reads as a dimmed "what
  // you did last time" instead of an empty box — and still logs nothing if left alone.
  const ghost = (i, col) => { const p = prevSet(i); return p && p[col.f] != null ? String(fmtNum(p[col.f])) : '' }

  // Tapping a number opens the phone's own keyboard. The +/- buttons that used to flank every
  // cell now live once, on the bar docked above that keyboard (KeyBar) — which is what freed
  // up the width this row now spends on the previous-session column.
  const cell = (s, i, col) => {
    const on = focus && focus.i === i && focus.col.f === col.f
    return <label key={col.f} className={'scell' + (on ? ' on' : '')}>
      {/* a typed effort is capped — there is no RPE 12, and 12 reps in reserve is a warm-up */}
      <NumberField decimal={col.dec} nullable={col.opt} value={s[col.f] ?? ''} placeholder={ghost(i, col)}
        onFocus={e => onFocusCell(i, col, e.target)} onBlur={onBlurCell}
        onChange={v => onField(i, col.f, col.eff ? capEffort(col.eff, v) : v)} />
    </label>
  }
  return <>
    <Media ex={ex} key={entry.id} compact={compact} minimizable />
    {/* A single exercise is titled by its card header; only a superset, which stacks two
        blocks under one header, still needs each block to name itself. */}
    {showName && <div className="row between" style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-.02em', textTransform: 'capitalize', lineHeight: 1.2 }}>{ex.n}</div>
      <button className="iconbtn" aria-label={t('Details')} onClick={() => exerciseDetailSheet(ex)}><Icon name="info" /></button>
    </div>}
    <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
      {cardio && <span className="tag acc"><Icon name="figureRun" />{t('Cardio')}</span>}
      {/* You log the total; this is the split, so the set in front of you is unambiguous
          without the rep count having to mean two different things (issue #31). */}
      {!cardio && !timed && isPerSide(cfg) && <span className="tag acc nocap"><Icon name="shuffle" />{t('{0} per side', fmtNum(sideReps(entry.sets.find(s => !s.done)?.r ?? entry.sets[0]?.r)))}</span>}
      {(ex.tg || ex.bp) && <span className="tag">{t(ex.tg || ex.bp)}</span>}
      {ex.eq && <span className="tag">{t(ex.eq)}</span>}
      {best > 0 && <span className="tag nocap">{t('Best:')} {fmtNum(best)} {S.unit}</span>}
      {/* The sets themselves moved into the PREV column; only the date has nowhere else to go. */}
      {last && <span className="tag nocap">{t('Last time')} {fmtDate(last.d)}</span>}
    </div>
    {plan && plan.why && plan.kind !== 'off' && <div className={'progline' + (plan.kind === 'deload' ? ' warn' : '')}>
      <Icon name={plan.kind === 'up' ? 'arrowUp' : plan.kind === 'deload' ? 'arrowDown' : 'lightbulb'} />
      <span>{t(...plan.why)}</span>
    </div>}
    <div className="settbl" style={{ '--sg': grid }}>
      <div className="sethead">
        <span>{t('Set')}</span>
        <span>{t('Prev')}</span>
        {cols.map(c => <span key={c.f}>{c.sh}</span>)}
        {timed && <span />}
        <span />
      </div>
      {/* Grouped so the entrance stagger (index.css: .sethead / .setlist / .setacts) applies to
          the rows as one unit, and so the design's 6px inter-row gap has somewhere to live that
          isn't each row's own padding. */}
      <div className="setlist">
        {entry.sets.map((s, i) => <div key={i} className={'setrow' + (s.done ? ' done' : '') + (i === justLogged ? ' justlogged' : '')}>
          <span className="sn">{i + 1}</span>
          <span className="sprev">{prevTxt(i)}</span>
          {cols.map(c => cell(s, i, c))}
          {/* A timed set is started, not typed: the timer counts the hold down and checks the
              set off itself. The button stays for anyone who timed it on their own watch. */}
          {timed && <button className="setgo" aria-label={t('Start set')} disabled={s.done || !!working}
            onClick={() => onStartTimed(i)}><Icon name="play" /></button>}
          <Check checked={s.done} onChange={() => onToggle(i)} />
        </div>)}
      </div>
      <div className="setacts">
        <Button size="sm" icon="minus" disabled={entry.sets.length <= 1} onClick={onRemoveSet}>{t('Remove set')}</Button>
        <Button size="sm" icon="plus" onClick={onAddSet}>{t('Add set')}</Button>
      </div>
    </div>
  </>
}

/* ---------- active workout ---------- */
function ActiveWorkout() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const { startRest, stopRest } = useUI()
  const A = S.active
  const units = supersetUnits(A.entries)
  const cur = Math.min(A.cur, Math.max(0, A.entries.length - 1))
  const unit = A.entries.length ? unitOf(units, cur) : []
  const unitIdx = units.findIndex(u => u === unit)

  // Which cell the on-screen keyboard is currently attached to. It is held here rather than in
  // the block because the bar that acts on it is docked to the screen, not to the row.
  const [focus, setFocus] = useState(null)   // { idx, i, col, el }
  const activeCard = useRef(null)
  const seenUnit = useRef(unitIdx)
  useKeyboardInset()

  // Feedback for the instant a set is ticked off — a brief pop on the row (justLogged, cleared
  // quickly) and a "Set logged: …" pill (loggedMsg, cleared after longer). Two separate
  // lifespans for the same event, same as the mock's own justDone/toast pair, because the pop
  // is a property of the row (~0.5s) while the pill is a property of the screen (~1.7s).
  const [justLogged, setJustLogged] = useState(null)   // { idx, i }
  const [loggedMsg, setLoggedMsg] = useState(null)      // { text, id } — id forces a fresh pop
  const loggedT = useRef({})
  useEffect(() => () => { clearTimeout(loggedT.current.pop); clearTimeout(loggedT.current.toast) }, [])

  const total = A.entries.reduce((n, e) => n + e.sets.length, 0)
  const done = setsDoneActive(A)
  // Same helper the finished-workout history screens use for this number, so what you see
  // mid-session and what gets saved to that workout's record never disagree.
  const vol = workoutVolume(A)

  const mutEntry = (idx, fn) => update(s => { fn(s.active.entries[idx]) }, true)
  // Clearing an optional field drops the key rather than storing null, so a set only carries
  // what was actually logged — in the session, in history and in a backup.
  const setField = (idx, i, field, v) => mutEntry(idx, e => {
    if (v == null) delete e.sets[i][field]; else e.sets[i][field] = v
  })
  // One step of whatever field the keyboard is on, driven from the bar. Same rules the rows'
  // own +/- had before they moved there: effort walks its own scale (see stepEffort), weight
  // and reps step up from 0 with no ceiling.
  const stepFocused = dir => {
    if (!focus) return
    const { idx, i, col } = focus
    const s = A.entries[idx].sets[i]
    if (col.eff) setField(idx, i, col.f, stepEffort(col.eff, s[col.f], dir))
    else setField(idx, i, col.f, Math.max(0, Math.round(((s[col.f] || 0) + dir * col.step) * 100) / 100))
    focus.el?.focus()   // a press on the bar must never be what puts the keyboard away
  }
  // Last session's value for the focused field — both what the bar offers to copy in and what
  // the cell has been showing greyed out as its placeholder.
  const prevValue = () => {
    if (!focus) return null
    const l = lastEntryFor(S, A.entries[focus.idx].id)
    const p = l && l.sets[focus.i]
    return p && p[focus.col.f] != null ? p[focus.col.f] : null
  }
  const usePrev = () => {
    const v = prevValue()
    if (v == null) return
    setField(focus.idx, focus.i, focus.col.f, v)
    focus.el?.focus()
  }
  // Moving between cells blurs one before focusing the next, so a blur only means "keyboard
  // gone" once it has landed somewhere that is not another set field. Deferred by a tick
  // because at blur time the next field has not been focused yet.
  const blurCell = () => setTimeout(() => {
    if (!document.activeElement || !document.activeElement.classList.contains('num')) setFocus(null)
  }, 0)
  const modeAt = idx => modeOf({ ...(A.entries[idx].target || {}), id: A.entries[idx].id })
  const addSet = idx => mutEntry(idx, e => {
    const l = e.sets[e.sets.length - 1]
    const m = modeOf({ ...(e.target || {}), id: e.id })
    if (m === 'cardio') e.sets.push({ min: l ? l.min : (e.target.min || 20), speed: l ? l.speed : (e.target.speed || 8), done: false })
    else if (m === 'time') e.sets.push({ sec: l ? l.sec : (e.target.sec || 45), w: l ? (l.w || 0) : (e.target.weight || 0), done: false })
    else e.sets.push({ w: l ? l.w : 0, r: l ? l.r : e.target.reps, done: false })
  })
  const removeSet = idx => mutEntry(idx, e => { if (e.sets.length > 1) e.sets.pop() })

  // A timed set is held, not typed. The work timer records what was actually held — an early
  // finish logs 0:38 of a 0:45 target rather than crediting the full prescription — and then
  // checks the set off through the normal path, so rest, supersets and the finish prompt all
  // behave exactly as they do for a reps set.
  const startTimed = (idx, i) => {
    const e = A.entries[idx]
    useUI.getState().startWork(e.sets[i].sec || 45, exOr(e.id).n, elapsed => {
      mutEntry(idx, en => { en.sets[i].sec = elapsed })
      if (!useStore.getState().S.active.entries[idx].sets[i].done) toggle(idx, i)
    })
  }

  const toggle = (idx, i) => {
    const m = modeAt(idx)
    const cardioEntry = m === 'cardio'
    const isLastUnit = unitIdx >= units.length - 1
    let askTop = false, exJustDone = false, workoutDone = false, advanceTo = null, loggedText = null
    mutEntry(idx, e => {
      e.sets[i].done = !e.sets[i].done
      if (e.sets[i].done) {
        beep(S.sound, 1040, 0.12); vibrate(30)
        const isLastExInUnit = idx === unit[unit.length - 1]
        const unitDone = unit.every(ui => (ui === idx ? e : A.entries[ui]).sets.every(x => x.done))
        if (isLastExInUnit && !unitDone) startRest(S.restSec)
        else if (unitDone) stopRest()
        if (unitDone && isLastUnit) workoutDone = true      // last exercise's last set → done
        // Finishing a unit is now what hands the screen to the next one: the card list replaced
        // the Prev/Next buttons that used to be the only way to move between exercises.
        else if (unitDone) advanceTo = units[unitIdx + 1][0]
        // Only loaded reps training has a "working weight" worth confirming — a bodyweight
        // plank has nothing to put in that slider, and neither does a set of push-ups
        // (issue #32: the fewest taps that still record what happened).
        const loaded = m === 'reps' && !(isBw({ ...(e.target || {}), id: e.id }) && !e.sets.some(x => x.w > 0))
        if (e.sets.every(x => x.done)) { exJustDone = true; if (loaded && !e.asked) { e.asked = true; askTop = true } }
        // The mock's own per-set feedback (a pop on the row plus a "Set logged" pill), read
        // from the set as it stands right after ticking it — same rule the toast uses in the
        // mock. Reps only: cardio/timed already get their own exercise-level toast below, and
        // a duration or a distance doesn't read the same way as a value that "counted".
        if (m === 'reps') loggedText = setLabel(e.id, e.sets[i], e.target)
      }
    })
    if (advanceTo != null) update(s => { s.active.cur = advanceTo })
    // reps: topWeight first (it chains into the finish/continue prompt on the last unit).
    // cardio/timed or already-confirmed: go straight to the prompt.
    if (askTop) topWeightSheet(idx)
    else if (workoutDone) workoutCompleteSheet()
    else if (exJustDone && cardioEntry) useUI.getState().toast(t('Cardio logged'))
    else if (exJustDone && m === 'time') useUI.getState().toast(t('Hold logged'))
    if (loggedText != null) {
      clearTimeout(loggedT.current.pop); clearTimeout(loggedT.current.toast)
      setJustLogged({ idx, i })
      // 760ms and 1760ms are the design's own justDone/toast windows (design_handoff_active_
      // workout/README.md), not durations picked to taste — the row's own pulse keyframe
      // (wkRowPulse, index.css) is self-contained at ~470ms and finishes well inside this.
      loggedT.current.pop = setTimeout(() => setJustLogged(null), 760)
      setLoggedMsg({ text: loggedText, id: Date.now() })
      loggedT.current.toast = setTimeout(() => setLoggedMsg(null), 1760)
    }
  }

  // Live-presence heartbeat so the admin dashboard can show who's training now. Signed-in only —
  // guests have no server session. Reads fresh state each tick so progress stays current.
  useEffect(() => {
    if (!useStore.getState().user) return
    let stopped = false
    const ping = active => {
      const A2 = useStore.getState().S.active
      if (!A2) return
      const u = supersetUnits(A2.entries)
      const c = Math.min(A2.cur, Math.max(0, A2.entries.length - 1))
      const ui = u.findIndex(x => x.includes(c))
      const tot = A2.entries.reduce((n, e) => n + e.sets.length, 0)
      api('/api/activity', { method: 'POST', body: JSON.stringify({
        active, name: A2.name, exIdx: ui + 1, exTotal: u.length,
        setsDone: setsDoneActive(A2), setsTotal: tot, startedAt: A2.start
      }) }).catch(() => {})
    }
    ping(true)
    const iv = setInterval(() => { if (!stopped) ping(true) }, 20000)
    return () => {
      stopped = true; clearInterval(iv)
      // best-effort "left" signal: sendBeacon survives a tab close, fetch covers in-app nav
      try { navigator.sendBeacon?.('/api/activity', new Blob([JSON.stringify({ active: false })], { type: 'application/json' })) } catch { /* */ }
      api('/api/activity', { method: 'POST', body: JSON.stringify({ active: false }) }).catch(() => {})
    }
  }, [])

  // Bring the newly active card up when the handoff happens on its own, so the eye lands where
  // the work now is. Guarded on a real change rather than firing on mount, where it would fight
  // the scroll-to-top that every route change already does.
  useEffect(() => {
    if (seenUnit.current === unitIdx) return
    seenUnit.current = unitIdx
    activeCard.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [unitIdx])

  return <div className="narrow">
    {/* The design's top-light wash — fixed behind the whole screen, not just this component's
        own box, since it's meant to read as coming from the device frame itself. Scoped to
        this screen only: Home/Login's own Hairline pass never had this element and adding it
        there wasn't asked for. */}
    <div className="wk-aura" aria-hidden="true" />
    {/* Pinned to the top of the screen while the exercise list scrolls under it — the clock,
        volume and set count are what you glance at mid-set, so they shouldn't require
        scrolling back up. Sticky rather than fixed: it stays a normal in-flow sibling of the
        card list, so it needs no extra scroll-padding hack to keep from covering the first
        card. VolumeReadout/Elapsed are unaffected either way — their tween and tick run on
        their own timers, independent of where the DOM node they render into ends up. */}
    <div className="wk-topbar">
      <div className="hdr">
        <button className="iconbtn" aria-label={t('Discard')} onClick={() => confirmSheet({ title: t('Discard workout?'), message: t('The sets you logged in this session will be lost.'), confirmText: t('Discard'), danger: true, onConfirm: () => { update(s => { s.active = null }); stopRest(); nav('/home') } })}><Icon name="xmark" /></button>
        <div style={{ textAlign: 'center' }}><div className="wk-title">{A.name}</div><div className="sub wk-stats"><Elapsed start={A.start} /> · <VolumeReadout value={vol} unit={S.unit} /> · {t('{0} sets', done + '/' + total)}</div></div>
        <button className="hdr-finish" onClick={finishWorkout}><Icon name="check" /><span>{t('Finish')}</span></button>
      </div>
      <div className="wprog"><i style={{ width: (total ? done / total * 100 : 0) + '%' }} /></div>
    </div>

    {/* Every exercise is on screen at once now, the one in hand expanded and the rest collapsed
        to a line — which is what lets the Prev/Next buttons go: a collapsed card is the way
        back, and finishing a unit opens the next one on its own (see `advanceTo` in toggle). */}
    {A.entries.length ? units.map((u, k) => {
      const active = k === unitIdx
      const es = u.map(i => A.entries[i])
      const nDone = es.reduce((n, e) => n + e.sets.filter(x => x.done).length, 0)
      const nTot = es.reduce((n, e) => n + e.sets.length, 0)
      const allDone = nTot > 0 && nDone === nTot
      return <div key={u[0]} ref={active ? activeCard : null}
        className={'excard' + (active ? ' now' : '') + (allDone ? ' done' : '')}>
        <div className="exhd" onClick={active ? undefined : () => { setFocus(null); update(s => { s.active.cur = u[0] }) }}>
          <div className="ext">
            <div className="exn">{es.map(e => exOr(e.id).n).join(' + ')}</div>
            {!active && <div className="exsum">{t('{0} sets', nDone + '/' + nTot)}</div>}
          </div>
          {/* A superset's blocks name themselves, and each carries its own details button. */}
          {active && u.length === 1 && <button className="iconbtn" aria-label={t('Details')}
            onClick={() => exerciseDetailSheet(exOr(es[0].id))}><Icon name="info" /></button>}
          <span className="exbadge">{allDone ? t('Done') : active ? t('Now') : t('Up next')}</span>
        </div>
        {active && (u.length > 1 ? (
          <div className="ss-card">
            <div className="ss-hd"><Icon name="link" />{t('Superset · do these back-to-back, rest after both')}</div>
            {u.map((idx, j) => <div key={idx} className="ss-ex">
              {j > 0 && <div className="ss-amp">+</div>}
              <ExerciseBlock entryIdx={idx} compact showName focus={focus && focus.idx === idx ? focus : null}
                justLogged={justLogged && justLogged.idx === idx ? justLogged.i : null}
                onToggle={i => toggle(idx, i)} onField={(i, f, v) => setField(idx, i, f, v)}
                onFocusCell={(i, col, el) => setFocus({ idx, i, col, el })} onBlurCell={blurCell}
                onAddSet={() => addSet(idx)} onRemoveSet={() => removeSet(idx)} onStartTimed={i => startTimed(idx, i)} />
            </div>)}
          </div>
        ) : (
          <ExerciseBlock entryIdx={u[0]} focus={focus && focus.idx === u[0] ? focus : null}
            justLogged={justLogged && justLogged.idx === u[0] ? justLogged.i : null}
            onToggle={i => toggle(u[0], i)} onField={(i, f, v) => setField(u[0], i, f, v)}
            onFocusCell={(i, col, el) => setFocus({ idx: u[0], i, col, el })} onBlurCell={blurCell}
            onAddSet={() => addSet(u[0])} onRemoveSet={() => removeSet(u[0])} onStartTimed={i => startTimed(u[0], i)} />
        ))}
      </div>
    }) : <div className="empty"><div className="ico"><Icon name="shuffle" /></div>{t('Freestyle workout — add your first exercise.')}</div>}

    <div style={{ height: 10 }} />
    <Button onClick={() => exercisePicker(ex => exConfigSheet(ex, null, cfg => update(s => {
      const full = { ...cfg, id: ex.id }
      const plan = nextPrescription(s, full, s.routines.find(r => r.id === s.active.routineId))
      s.active.entries.push({ id: ex.id, target: { ...cfg }, plan, sets: applyPrescription(buildSets(s, full), plan) })
      s.active.cur = s.active.entries.length - 1
    }), null, S.routines.find(r => r.id === A.routineId)))} icon="plus">{t('Add exercise')}</Button>
    <div style={{ height: 10 }} />
    {(() => {
      const exDone = A.entries.filter(e => e.sets.length && e.sets.every(s => s.done)).length
      const allDone = A.entries.length > 0 && exDone === A.entries.length
      return <button className={allDone ? 'btn primary' : 'btn ghost dim'} onClick={finishWorkout}>
        {allDone ? t('Finish workout') : t('Finish workout early · {0} exercises', exDone + '/' + A.entries.length)}
      </button>
    })()}
    <div style={{ height: 40 }} />
    {/* Docked to the top of the phone's own keyboard — see lib/keyboard.js for how its height
        is found, since iOS never moves the layout viewport out from under it. */}
    {focus && <KeyBar label={focus.col.hd} prev={(() => { const v = prevValue(); return v == null ? null : fmtNum(v) })()}
      onStep={stepFocused} onPrev={usePrev} onDone={() => { focus.el?.blur(); setFocus(null) }} />}
    {loggedMsg && <SetToast key={loggedMsg.id} text={loggedMsg.text} />}
  </div>
}

export default function Workout() {
  const active = useStore(s => s.S.active)
  return active ? <ActiveWorkout /> : <StartChooser />
}
