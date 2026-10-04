import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { exOr } from '../lib/exercises.js'
import { effectiveRoutine, lastEntryFor, buildSets, setsDoneActive, supersetUnits, unitOf, setLabel, modeOf, isBw, isPerSide, sideReps, EFFORT, effortOf, capEffort, fmtSec, nextUp, nextSetLabel, isLoadPR } from '../lib/history.js'
import { fmtNum, fmtVol, todayISO, exCount, DAYN } from '../lib/format.js'
import { beep, vibrate } from '../lib/sound.js'
import { t } from '../lib/i18n.js'
import { api } from '../lib/api.js'
import { Thumb } from '../components/Media.jsx'
import { startFlow, exercisePicker, exConfigSheet, exerciseDetailSheet, finishWorkout, workoutCompleteSheet, confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import Orb from '../components/Orb.jsx'
import { Button, Check, NumberField } from '../components/ui.jsx'
import { nextPrescription, applyPrescription } from '../lib/progression.js'
import { glyphOf } from '../lib/glyphs.js'

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

/* ---------- one exercise's sets (reps: weight×reps · time: a held duration · cardio: duration+speed) ---------- */
// The Peek design's set table: Set | Last time | the numbers | ✓. Done rows turn green and
// read back as text; open rows are plain inputs, the way the design draws them, instead of
// the +/- steppers the old layout used — with "last time" beside every set there is no room
// for three buttons a column, and the prescription already fills the numbers in.
function SetGrid({ entryIdx, onToggle, onField, onStartTimed }) {
  const S = useStore(s => s.S)
  const working = useUI(s => s.work)
  const entry = S.active.entries[entryIdx]
  const mode = modeOf({ ...(entry.target || {}), id: entry.id })
  const cardio = mode === 'cardio'
  const timed = mode === 'time'
  const last = lastEntryFor(S, entry.id)
  // A bodyweight set has no weight to type, so the column is not there (issue #32) — adding a
  // belt weight in the config brings it back, now labelled as the addition it is.
  const cfg = { ...(entry.target || {}), id: entry.id }
  const bw = !cardio && isBw(cfg)
  const added = bw && entry.sets.some(s => s.w > 0)
  const loadCol = { f: 'w', dec: true, hd: bw ? '+' + S.unit : S.unit, w: '64px' }
  const repCol = { f: 'r', dec: false, hd: t('Reps'), w: '54px' }
  const cols = cardio ? [{ f: 'min', dec: false, hd: t('Min'), w: '54px' }, { f: 'speed', dec: true, hd: 'km/h', w: '58px' }]
    : timed ? [{ f: 'sec', dec: false, hd: t('Sec'), w: '54px' }, ...((bw && !added) ? [] : [loadCol])]
      : (bw && !added) ? [repCol] : [loadCol, repCol]
  // Effort (RIR or RPE, whichever the profile logs) only for weighted rep sets, and opt-in.
  // `opt` because an unlogged effort is not the same as 0 — RIR 0 says the set went to failure.
  const kind = effortOf(S)
  const eff = EFFORT[kind]
  if (mode === 'reps' && eff) cols.push({ f: eff.f, eff: kind, dec: true, opt: true, hd: eff.hd, w: '46px' })
  const grid = { gridTemplateColumns: ['26px', 'minmax(0,1fr)', ...cols.map(c => c.w), ...(timed ? ['36px'] : []), '36px'].join(' ') }
  const shown = (c, v) => (v == null || v === '' ? '—' : c.f === 'sec' ? fmtSec(v) : fmtNum(v))

  return <div className="pk-sets">
    <div className="pk-set hd" style={grid}><span>{t('Set')}</span><span>{t('Last time')}</span>{cols.map(c => <span key={c.f}>{c.hd}</span>)}{timed && <span />}<span /></div>
    {entry.sets.map((s, i) => {
      const prev = last && last.sets[i] ? setLabel(entry.id, last.sets[i], last.target) : '—'
      return <div key={i} className={'pk-set' + (s.done ? ' done' : '')} style={{ ...grid, '--i': i }} data-set={entryIdx + '-' + i}>
        <span className="n">{i + 1}</span>
        <span className="prev">{prev}</span>
        {cols.map(c => s.done
          ? <span key={c.f} className="v">{shown(c, s[c.f])}</span>
          : <NumberField key={c.f} decimal={c.dec} nullable={c.opt} value={s[c.f] ?? ''} aria-label={c.hd}
            // a typed effort is capped — there is no RPE 12, and 12 reps in reserve is a warm-up
            onChange={v => onField(i, c.f, c.eff ? capEffort(c.eff, v) : v)} />)}
        {/* A timed set is started, not typed: the timer counts the hold down and checks the
            set off itself. The checkbox stays for anyone who timed it on their own watch. */}
        {timed && <button className="setgo" aria-label={t('Start set')} disabled={s.done || !!working}
          onClick={() => onStartTimed(i)}><Icon name="play" /></button>}
        <Check checked={s.done} onChange={() => onToggle(i)} />
      </div>
    })}
  </div>
}

/* ---------- one exercise inside an open card ---------- */
function ExerciseBody({ entryIdx, inSuperset, onToggle, onField, onAddSet, onRemoveSet, onStartTimed }) {
  const S = useStore(s => s.S)
  const entry = S.active.entries[entryIdx]
  const ex = exOr(entry.id)
  const cfg = { ...(entry.target || {}), id: entry.id }
  const mode = modeOf(cfg)
  // What the progression policy decided for this session, and why (issue #17). Computed when
  // the session was built so the reason matches the numbers already in the rows.
  const plan = entry.plan
  return <div className="pk-ex-part">
    {inSuperset && <div className="pk-ex-sub">{ex.n}</div>}
    <div className="pk-ex-meta">
      {/* A still, not the animation: mid-workout you know the lift, and the GIF pushed the
          sets you actually tap below the rest bar. The movement is one tap away in Details. */}
      <button className="pk-thumb" onClick={() => exerciseDetailSheet(ex)} aria-label={t('Details')}><Thumb ex={ex} /></button>
      {mode === 'cardio' && <span className="tag acc"><Icon name="figureRun" />{t('Cardio')}</span>}
      {/* You log the total; this is the split, so the set in front of you is unambiguous
          without the rep count having to mean two different things (issue #31). */}
      {mode === 'reps' && isPerSide(cfg) && <span className="tag acc nocap"><Icon name="shuffle" />{t('{0} per side', fmtNum(sideReps(entry.sets.find(s => !s.done)?.r ?? entry.sets[0]?.r)))}</span>}
      <button className="pk-info" onClick={() => exerciseDetailSheet(ex)}><Icon name="info" />{t('Details')}</button>
    </div>
    {plan && plan.why && plan.kind !== 'off' && <div className={'progline' + (plan.kind === 'deload' ? ' warn' : '')}>
      <Icon name={plan.kind === 'up' ? 'arrowUp' : plan.kind === 'deload' ? 'arrowDown' : 'lightbulb'} />
      <span>{t(...plan.why)}</span>
    </div>}
    <SetGrid entryIdx={entryIdx} onToggle={onToggle} onField={onField} onStartTimed={onStartTimed} />
    <div className="pk-ex-acts">
      <Button size="sm" variant="soft" icon="minus" disabled={entry.sets.length <= 1} onClick={onRemoveSet}>{t('Remove set')}</Button>
      <Button size="sm" variant="soft" icon="plus" onClick={onAddSet}>{t('Add set')}</Button>
    </div>
  </div>
}

/* ---------- a card body that folds shut instead of vanishing ---------- */
// Kept mounted through the close so the rows can be seen folding away, then dropped, so a
// closed card costs nothing and reopening replays the entrance. Matches the CSS transition.
const FOLD_MS = 520
function Fold({ open, children }) {
  const [shown, setShown] = useState(open)
  useEffect(() => {
    if (open) { setShown(true); return }
    const id = setTimeout(() => setShown(false), FOLD_MS)
    return () => clearTimeout(id)
  }, [open])
  return <div className={'pk-fold' + (open ? ' open' : '')} inert={!open}>
    <div className="pk-fold-in">{(open || shown) && children}</div>
  </div>
}

// What a finished card says it was, in one line under its name — finishing leaves something
// behind to look at. Volume for loaded sets; reps where there's no load to multiply (a
// bodyweight set's "+5 kg" times reps isn't the work done); time or minutes otherwise.
function doneSummary(es, unit) {
  let sets = 0, vol = 0, reps = 0, sec = 0, min = 0, bw = true
  es.forEach(e => {
    const cfg = { ...(e.target || {}), id: e.id }
    const m = modeOf(cfg)
    if (m !== 'reps' || !isBw(cfg)) bw = false
    e.sets.forEach(s => {
      if (!s.done) return
      sets++
      if (m === 'cardio') min += s.min || 0
      else if (m === 'time') sec += s.sec || 0
      else { vol += (s.w || 0) * (s.r || 0); reps += s.r || 0 }
    })
  })
  const parts = [t(sets === 1 ? '{0} set' : '{0} sets', sets)]
  if (vol > 0 && !bw) parts.push(fmtVol(vol, unit))
  else if (reps) parts.push(t('{0} reps', reps))
  if (sec) parts.push(fmtSec(sec))
  if (min) parts.push(t('{0} min', min))
  return parts.join(' · ')
}

// A spray of sparks and a ring from the box that finished an exercise. Plain DOM outside
// React: it lives under a second and no state reads it. Skipped under reduced motion, where
// the global rule would freeze the sparks in place instead of removing them.
function burst(el) {
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const r = el.getBoundingClientRect(), b = document.createElement('div')
  b.className = 'pk-burst'
  b.style.left = r.left + r.width / 2 + 'px'; b.style.top = r.top + r.height / 2 + 'px'
  b.append(document.createElement('b'))
  for (let k = 0; k < 14; k++) {
    const sp = document.createElement('i')
    sp.style.setProperty('--a', k * (360 / 14) + Math.random() * 16 + 'deg')
    sp.style.setProperty('--d', 30 + Math.random() * 30 + 'px')
    b.append(sp)
  }
  document.body.append(b)
  setTimeout(() => b.remove(), 900)
}

// How long a just-finished card holds before the next one opens. Advancing on the same frame
// read as the exercise disappearing; the beat lets the last green row and the cheer land first.
const CHEER_MS = 650

/* ---------- active workout ---------- */
// D2 from the Peek design: every exercise as a card in one list (the open one is the unit
// you're on — a superset is one card), the orb cheering each checked set, and a dark dock at
// the bottom saying what's next, which the rest bar takes the place of while you recover.
// The tab bar is hidden for the session (App.jsx); ‹ goes Home and the session keeps running.
function ActiveWorkout() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const { startRest, stopRest } = useUI()
  const resting = useUI(s => !!(s.timer || s.work))
  const orb = useRef(null)
  const listRef = useRef(null)
  const advance = useRef(null)
  const [collapsed, setCollapsed] = useState(false)
  const [cheer, setCheer] = useState(null)
  const A = S.active
  const units = supersetUnits(A.entries)
  const cur = Math.min(A.cur, Math.max(0, A.entries.length - 1))
  const unit = A.entries.length ? unitOf(units, cur) : []
  const unitIdx = units.findIndex(u => u === unit)

  const total = A.entries.reduce((n, e) => n + e.sets.length, 0)
  const done = setsDoneActive(A)
  const nx = nextUp(A)
  const nxEntry = nx && A.entries[nx.entry]
  const unitsDone = units.filter(u => u.every(i => A.entries[i].sets.every(s => s.done))).length

  const mutEntry = (idx, fn) => update(s => { fn(s.active.entries[idx]) }, true)
  // Clearing an optional field drops the key rather than storing null, so a set only carries
  // what was actually logged — in the session, in history and in a backup.
  const setField = (idx, i, field, v) => mutEntry(idx, e => {
    if (v == null) delete e.sets[i][field]; else e.sets[i][field] = v
  })
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
    let exJustDone = false, workoutDone = false, unitJustDone = false
    mutEntry(idx, e => {
      e.sets[i].done = !e.sets[i].done
      if (e.sets[i].done) {
        beep(S.sound, 1040, 0.12); vibrate(30)
        const isLastExInUnit = idx === unit[unit.length - 1]
        const unitDone = unit.every(ui => (ui === idx ? e : A.entries[ui]).sets.every(x => x.done))
        if (isLastExInUnit && !unitDone) startRest(S.restSec)
        else if (unitDone) stopRest()
        unitJustDone = unitDone
        // a whole exercise done gets more than a set: a rising three-note chime, a longer buzz
        if (unitDone) {
          beep(S.sound, 1318, 0.14, 0.09); beep(S.sound, 1568, 0.26, 0.18)
          vibrate([30, 60, 30, 60, 90])
          orb.current?.react('joyful-down-right', 1800)
        } else orb.current?.react('joyful-wide', 1100)
        if (unitDone && isLastUnit) workoutDone = true      // last exercise's last set → done
        // No "confirm the weight you worked with" sheet here any more: finishing the workout
        // already keeps the heaviest done set as next time's starting weight, so the sheet
        // only asked for a number the app had.
        if (e.sets.every(x => x.done)) exJustDone = true
      }
    })
    if (unitJustDone) {
      burst(listRef.current?.querySelector(`[data-set="${idx}-${i}"] .chk`))
      setCheer(unit.join('-'))
      clearTimeout(advance.current?.id)
    }
    // the last set of the session asks finish-or-continue — after the same beat, so the
    // celebration isn't hidden behind the sheet; otherwise the next unfinished card opens
    if (workoutDone) {
      const go = () => { advance.current = null; setCheer(null) }
      advance.current = { go, id: setTimeout(() => { go(); workoutCompleteSheet() }, CHEER_MS) }
    } else {
      if (unitJustDone) {
        // nextUp is read when the beat ends, not now: a set unchecked meanwhile keeps you here
        const go = () => { advance.current = null; setCheer(null); update(s => { const n = s.active && nextUp(s.active); if (n) s.active.cur = n.entry }) }
        advance.current = { go, id: setTimeout(go, CHEER_MS) }
      }
      if (exJustDone && cardioEntry) useUI.getState().toast(t('Cardio logged'))
      else if (exJustDone && m === 'time') useUI.getState().toast(t('Hold logged'))
    }
  }

  // Leaving mid-beat still moves on, so coming back lands on the next exercise (but doesn't
  // pop the finish sheet over whatever screen you went to — that's still one tap on Finish).
  useEffect(() => () => { if (advance.current) { clearTimeout(advance.current.id); advance.current.go() } }, [])

  const openUnit = k => {
    if (advance.current) { clearTimeout(advance.current.id); advance.current = null; setCheer(null) }
    if (k === unitIdx) { setCollapsed(c => !c); return }
    setCollapsed(false)
    update(s => { s.active.cur = units[k][0] })
  }

  // Bring the newly opened card into view. The card above it is folding shut at the same time,
  // so aim for where the header will end up, not where it is this frame — and leave the page
  // alone if that's already comfortably on screen.
  const shownUnit = useRef(unitIdx)
  useLayoutEffect(() => {
    if (shownUnit.current === unitIdx) return
    shownUnit.current = unitIdx
    const cards = listRef.current?.children
    if (!cards?.[unitIdx]) return
    let shift = 0
    for (let k = 0; k < unitIdx; k++) shift += cards[k].querySelector('.pk-fold-in')?.offsetHeight || 0
    const top = cards[unitIdx].getBoundingClientRect().top - shift
    if (top >= 8 && top <= innerHeight * 0.4) return
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    scrollTo({ top: scrollY + top - 16, behavior: still ? 'auto' : 'smooth' })
  }, [unitIdx])

  const discard = () => confirmSheet({
    title: t('Discard workout?'), message: t('The sets you logged in this session will be lost.'), confirmText: t('Discard'), danger: true,
    onConfirm: () => { update(s => { s.active = null }); stopRest(); nav('/home') }
  })

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

  return <div className="narrow pk-workout">
    <div className="pk-wtop">
      <button className="iconbtn" aria-label={t('Home')} onClick={() => nav('/home')}><Icon name="chevronLeft" /></button>
    </div>
    <div className="pk-whead">
      <div className="pk-wtitle"><span className="el"><Elapsed start={A.start} /></span><h1>{A.name}</h1></div>
      <Orb ref={orb} size={60} poke="joyful-wide" />
    </div>
    <div className="pk-wprog">
      {/* keyed on finished exercises, so a glint runs along the bar each time one completes */}
      <div className="bar"><i style={{ width: (total ? done / total * 100 : 0) + '%' }}>{unitsDone > 0 && <b key={unitsDone} />}</i></div>
      <span>{done}/{total}</span>
    </div>

    {A.entries.length ? <div className="pk-exlist" ref={listRef}>
      {units.map((u, k) => {
        const open = k === unitIdx && !collapsed
        const es = u.map(i => A.entries[i])
        const d = es.reduce((n, e) => n + e.sets.filter(s => s.done).length, 0)
        const n = es.reduce((n, e) => n + e.sets.length, 0)
        const key = u.join('-')
        const pr = d === n && es.some(e => isLoadPR(S, e.id, e))
        return <div key={key} className={'pk-ex' + (open ? ' open' : '') + (d === n ? ' finished' : '') + (cheer === key ? ' cheer' : '')}>
          <button className="pk-ex-h" onClick={() => openUnit(k)} aria-expanded={open}>
            <span className="nm">{u.length > 1 && <em><Icon name="link" />{t('Superset')}</em>}{es.map(e => exOr(e.id).n).join(' + ')}
              {d === n && <span className="pk-ex-sum">{doneSummary(es, S.unit)}{pr && <b><Icon name="trophy" />{t('New best')}</b>}</span>}</span>
            <span className="ct">{d === n && <Icon name="check" />}{d}/{n}</span>
          </button>
          <Fold open={open}><div className="pk-ex-b">
            {u.map(idx => <ExerciseBody key={idx} entryIdx={idx} inSuperset={u.length > 1}
              onToggle={i => toggle(idx, i)} onField={(i, f, v) => setField(idx, i, f, v)}
              onAddSet={() => addSet(idx)} onRemoveSet={() => removeSet(idx)} onStartTimed={i => startTimed(idx, i)} />)}
          </div></Fold>
        </div>
      })}
    </div> : <div className="empty"><div className="ico"><Icon name="shuffle" /></div>{t('Freestyle workout — add your first exercise.')}</div>}

    <div style={{ height: 12 }} />
    <Button variant="soft" icon="plus" onClick={() => exercisePicker(ex => exConfigSheet(ex, null, cfg => update(s => {
      const full = { ...cfg, id: ex.id }
      const plan = nextPrescription(s, full, s.routines.find(r => r.id === s.active.routineId))
      s.active.entries.push({ id: ex.id, target: { ...cfg }, plan, sets: applyPrescription(buildSets(s, full), plan) })
      s.active.cur = s.active.entries.length - 1
    }), null, S.routines.find(r => r.id === A.routineId)))}>{t('Add exercise')}</Button>
    <button className="pk-link pk-discard" onClick={discard}>{t('Discard workout')}</button>

    {/* while a rest or a timed set runs, the timer bar (RestTimer) sits exactly here instead */}
    {!resting && <div className="pk-dock">
      {/* keyed on the set it points at, so the line visibly turns over when it changes */}
      <div className="txt" key={nx ? nx.entry + ':' + nx.set : 'end'}>
        {/* exercise names arrive lowercase from the dataset — capitalised on their own, not the whole line */}
        <span>{nx ? <>{t('Up next')} · <i className="capitalize">{exOr(nxEntry.id).n}</i>, {t('set {0}', nx.set + 1)}</> : t('Up next · finish when ready')}</span>
        <b>{nx ? nextSetLabel(nxEntry, nxEntry.sets[nx.set], S.unit) : t('All sets done')}</b>
      </div>
      <button className="go" onClick={finishWorkout}>{t('Finish')}</button>
    </div>}
  </div>
}

export default function Workout() {
  const active = useStore(s => s.S.active)
  return active ? <ActiveWorkout /> : <StartChooser />
}
