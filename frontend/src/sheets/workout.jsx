// The workout lifecycle: starting one, the workout-detail view, finishing (with the PR/1RM
// summary), the calendar (which doubles as day-planning entry point), and importing workout/bodyweight history from another app's export.
import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { EXIDX } from '../lib/exercises.js'
import { fmtDate, fmtNum, fmtVol, fmtDur, durPart, todayISO, isoOf, uid, MONTHS_LONG } from '../lib/format.js'
import { isLoadPR, buildSets, effectiveRoutineId, workoutVolume, setsDone, setsDoneActive, lastEntryFor, setLabel, effortOf, previousSession } from '../lib/history.js'
import { beep } from '../lib/sound.js'
import { t, dateLocale } from '../lib/i18n.js'
import { nav } from '../lib/nav.js'
import { glyphOf } from '../lib/glyphs.js'
import Icon from '../components/Icon.jsx'
import { Thumb } from '../components/Media.jsx'
import Orb from '../components/Orb.jsx'
import { Button } from '../components/ui.jsx'
import { parseImport, mergeImport } from '../lib/import-csv.js'
import { is1RMRecord } from '../lib/onerm.js'
import { nextPrescription, applyPrescription } from '../lib/progression.js'
import { sessionPlan, spendSwaps } from '../lib/liftfix.js'
import { sessionVerdict } from '../lib/verdict.js'
import { finishFeel, pickLine, liftVerdict, liftSummary, nextAsk, promptKind, PROMPT, PROMPT_LEAVE } from '../lib/finishfeel.js'
import Say from '../components/Say.jsx'
import { S, update, ui, toast, snd, confirmSheet } from './common.jsx'
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
// Straight into the session — no weigh-in on the way. Body weight is logged when you choose to
// (Home's card); a weigh-in from earlier today still rides along on the workout record.
export function startFlow(routineId) { beginWorkout(routineId) }
export function beginWorkout(routineId) {
  const st = S()
  const r = routineId ? st.routines.find(x => x.id === routineId) : null
  // The prescription is applied as the session is built, so you walk up to the bar with the
  // right weight already on the screen instead of being told about it afterwards. `plan` is
  // kept on the entry purely so the workout can explain the number it chose. A one-session
  // swap Peek suggested (lib/liftfix.js) is put in place here.
  const entries = sessionPlan(r).map(cfg => {
    const plan = nextPrescription(st, cfg, r)
    return { id: cfg.id, sg: cfg.sg, target: { ...cfg }, plan, sets: applyPrescription(buildSets(st, cfg), plan) }
  })
  const today = st.bodyweight.find(b => b.d === todayISO())
  update(s => {
    s.active = { id: uid(), d: todayISO(), start: Date.now(), routineId, name: r ? r.name : t('Freestyle'), bw: today ? today.w : null, cur: 0, entries }
  })
  useUI.getState().stopRest()
  nav('/workout')
}
// The card that asks before finishing — shown when the last set is checked, and when Finish is
// pressed with sets still open. Peek is glad when everything is done and visibly let down when
// you're leaving sets on the table: its face and body sag, and a row of dots shows what's still
// hollow. It's a nudge to stay, not a lock — "Finish anyway" is always one tap, after a beat for
// Peek to take it in. (promptKind / PROMPT, lib/finishfeel.js)
const PIPS_MAX = 30
function FinishPrompt({ done, total, onFinish, close }) {
  const kind = promptKind({ done, total })
  const complete = kind === 'complete'
  const orb = useRef(null)
  const [leaving, setLeaving] = useState(false)
  const lead = PROMPT[kind]
  // one dot per set; a very long session is squeezed to PIPS_MAX so the row stays a row
  const n = Math.min(total, PIPS_MAX)
  const on = total > PIPS_MAX ? Math.round(done / total * n) : done
  useEffect(() => {
    if (reduced()) return
    const tm = setTimeout(() => orb.current?.bump(complete ? 'hop' : 'sink'), 320)
    return () => clearTimeout(tm)
  }, [])
  const leave = () => {
    if (leaving) return
    setLeaving(true)
    orb.current?.react('shy-downward', 1400)
    orb.current?.bump('sink')
    setTimeout(() => { close(); onFinish() }, reduced() ? 0 : 900)
  }
  return <div className={'pk-fin ' + (complete ? 'complete' : 'early')}>
    <div className="pk-fin-stage">
      {complete && !reduced() && <Sparks k={0.55} />}
      <Orb ref={orb} size={112} mood={complete ? 'celebrate' : 'disappointed'} verdict={complete ? 'progressing' : 'slipping'} poke={complete ? 'joyful-wide' : 'shy-downward'} />
    </div>
    <h3>{t(lead.head)}</h3>
    <div className="pk-pips" aria-hidden="true">
      {Array.from({ length: n }, (_, k) => <i key={k} className={k < on ? 'on' : k === on ? 'next' : ''} style={{ '--i': Math.min(k, 14) }} />)}
    </div>
    <div className="pk-fin-say">
      <Say key={leaving ? 'leave' : 'line'} className="up" orb={orb} text={t(leaving ? PROMPT_LEAVE : lead.line)} />
    </div>
    {complete
      ? <>
        <Button variant="primary" icon="flag" onClick={() => { close(); onFinish() }}>{t('Finish workout')}</Button>
        <div style={{ height: 8 }} />
        <Button onClick={() => { close(); toast(t('Keep going — tap “+ Add exercise” below')) }}>{t('Continue workout')}</Button>
      </>
      : <>
        <Button variant="primary" disabled={leaving} onPointerEnter={() => orb.current?.react('joyful-wide', 900)} onClick={close}>{t('Keep going')}</Button>
        <div style={{ height: 8 }} />
        <Button variant="ghost" className="dim" disabled={leaving} onPointerDown={() => orb.current?.react('shy-downward', 1200)} onClick={leave}>{t(kind === 'none' ? 'Wrap up anyway' : 'Finish anyway')}</Button>
      </>}
  </div>
}
function askFinish() {
  const A = S().active
  if (!A) return
  const done = setsDoneActive(A)
  const total = A.entries.reduce((n, e) => n + e.sets.length, 0)
  ui().openSheet(close => <FinishPrompt done={done} total={total} onFinish={() => doFinishWorkout({ done, total })} close={close} />, { kind: 'center' })
}
export const workoutCompleteSheet = askFinish

// The finished workout as a whole screen, in Peek’s voice — and without a single number. It is
// meant to be read in one glance: did that go well? (finishFeel, lib/finishfeel.js) Peek hops and
// says one line, a badge checks itself off, and a new best sets off sparks. Volume, duration and
// per-lift figures live in the workout’s detail page and the progress views; here the point is
// to feel done. A lighter day gets a calm check, never a scolding — you still showed up.
//
// The muscle map stays: it is the one part that says something a headline doesn't.
const DONE_MOOD = { record: 'celebrate', good: 'happy', light: 'proud' }
const DONE_BODY = { record: 'progressing', good: 'progressing' }
const DONE_HEAD = { record: 'New best!', good: 'Good workout', light: 'Done for today' }
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
// sparks fly out from behind the orb: angle, distance, and a stagger so they don't leave as one ring
const SPARKS = Array.from({ length: 18 }, (_, k) => ({ a: k * 20 + (k % 2) * 7, d: 118 + (k % 3) * 22, dl: 380 + (k % 6) * 45 }))
// `k` scales how far they fly, for the smaller orb on the finish prompt
function Sparks({ k = 1, rings = 1 }) {
  return <div className="pk-done-sparks" aria-hidden="true">
    <b style={{ '--k': k }} />{rings > 1 && <b className="two" style={{ '--k': k }} />}
    {SPARKS.map((s, i) => <i key={i} style={{ '--a': s.a + 'deg', '--d': s.d * k + 'px', '--dl': s.dl + 'ms' }} />)}
  </div>
}

// One row per exercise: a mark and a few words on how it went against last time. The mark is
// what reads at a glance (a star, an arrow up, a check…); the words are for the second look.
const LIFT_MARK = { best: '★', up: '↑', same: '✓', new: '✓', down: '↓', partial: '○', skipped: '–' }
const LIFT_WORDS = { best: 'New best', up: 'Up on last time', same: 'Matched last time', new: 'First time', down: 'Lighter today', partial: 'Not all sets', skipped: 'Skipped' }

const NEXT_MARK = { up: '↑', hold: '→', deload: '↓', first: '•' }

function FinishSummary({ w, lifts = [], next = [], feel, close }) {
  const st = useStore(s => s.S)
  const unit = st.unit
  // this week, Monday first, as the Home strip draws it — today's dot is the one this workout
  // just filled, so it is the last to light up
  const week = (() => {
    const at = new Date(w.d + 'T12:00:00')
    const monday = new Date(at); monday.setDate(at.getDate() - ((at.getDay() + 6) % 7))
    const days = new Set(st.workouts.map(x => x.d))
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday); d.setDate(monday.getDate() + i)
      const iso = isoOf(d)
      return { iso, d, done: days.has(iso), now: iso === w.d }
    })
  })()
  const orb = useRef(null)
  const nameOf = id => (EXIDX[id] || {}).n || id
  const good = feel !== 'light'
  // Peek speaks once the badge has landed; a held-back line is the beat that makes it read as
  // "it said that to me" rather than a caption
  const [talk, setTalk] = useState(reduced())
  useEffect(() => {
    const tm = [setTimeout(() => setTalk(true), 1000)]
    if (!reduced()) {
      tm.push(setTimeout(() => orb.current?.bump(good ? 'hop' : 'nod'), 260))
      if (feel === 'record') tm.push(setTimeout(() => orb.current?.bump('hop'), 1100))
    }
    return () => tm.forEach(clearTimeout)
  }, [])
  const done = () => { close(); nav('/home') }
  // the system share sheet where there is one, the clipboard where there isn't
  const share = async () => {
    const text = [w.name, ...durPart(w.end - w.start), t('{0} sets', setsDone(w))].join(' · ') + ' · ' + fmtVol(w.vol, unit)
    try {
      if (navigator.share) await navigator.share({ text })
      else { await navigator.clipboard.writeText(text); toast(t('Copied to clipboard')) }
    } catch (e) { if (e.name !== 'AbortError') toast(t('Could not share')) }
  }
  return <div className={'pk-done ' + feel}>
    <div className="pk-done-orb">
      <div className="pk-done-stage">
        {/* rendered only when it should be seen: under reduced motion the global rule would
            freeze the sparks in place instead of removing them */}
        {good && !reduced() && <Sparks rings={feel === 'record' ? 2 : 1} />}
        <Orb ref={orb} size={180} mood={DONE_MOOD[feel]} verdict={DONE_BODY[feel]} poke="joyful-wide" />
        <svg className="pk-done-badge" viewBox="0 0 56 56" aria-hidden="true">
          <circle cx="28" cy="28" r="26" />
          <path d="M17 29.5l8 8 15-17" />
        </svg>
      </div>
    </div>
    <div className="pk-done-h">
      <h1>{t(DONE_HEAD[feel])}</h1>
      <p>{lifts.length ? t(liftSummary(lifts.map(l => l.v))) : w.name}</p>
    </div>
    <div className="pk-done-say">
      {talk && <Say className="up" orb={orb} text={t(pickLine(feel, w.id))} />}
    </div>
    {/* each lift ticks in one after another, the way Peek would go down the list with you */}
    <div className="pk-lifts">
      {lifts.map((l, i) => <div key={l.id} className={'pk-lift ' + l.v} style={{ '--i': Math.min(i, 8) }}>
        <span className="ic" aria-hidden="true">{LIFT_MARK[l.v]}</span>
        <b className="capitalize">{nameOf(l.id)}</b>
        <span className="v">{t(LIFT_WORDS[l.v])}</span>
      </div>)}
    </div>
    <div className="card pk-done-card">
      <div className="pk-card-h"><b>{t('Your week')}</b></div>
      <div className="pk-week pk-done-week">
        {week.map(x => <div key={x.iso} className={'pk-day' + (x.now ? ' today' : '')}>
          <span>{x.d.toLocaleDateString(dateLocale(), { weekday: 'narrow' })}</span>
          <i className={x.now ? 'done now' : x.done ? 'done' : ''} />
        </div>)}
      </div>
    </div>
    {/* where each lift goes from here: the direction in words, so the next session already has
        a goal before it starts */}
    {next.length > 0 && <div className="card pk-done-card">
      <div className="pk-card-h"><b>{t('Next time')}</b></div>
      <div className="pk-next">
        {next.map(n => <div key={n.id} className={'pk-next-row ' + n.k}>
          <b className="capitalize">{nameOf(n.id)}</b>
          <span><em aria-hidden="true">{NEXT_MARK[n.k]}</em>{t(n.what)}</span>
        </div>)}
      </div>
    </div>}
    <div className="pk-done-acts">
      <Button variant="primary" onClick={done}>{t('Done')}</Button>
      <Button variant="soft" onClick={share}>{t('Share')}</Button>
    </div>
  </div>
}
export function finishWorkout() {
  const A = S().active
  if (!A) return
  const done = setsDoneActive(A)
  const total = A.entries.reduce((n, e) => n + e.sets.length, 0)
  // everything done: no question to ask; anything less goes past Peek first
  if (done < total || !done) { askFinish(); return }
  doFinishWorkout({ done, total })
}
function doFinishWorkout({ done, total }) {
  const st = S()
  const A = st.active
  if (!A) return
  const prs = []
  const e1prs = []
  A.entries.forEach(e => {
    if (isLoadPR(st, e.id, e)) prs.push(e.id)
    // A heavier estimate without a heavier top set is its own kind of progress —
    // same weight for more reps. Reported separately so it can't be read as a load PR.
    const rec = is1RMRecord(st, e.id, e)
    if (rec && !prs.includes(e.id)) e1prs.push({ id: e.id, ...rec })
  })
  // Each exercise against the last time it was logged — read now, before this workout joins the
  // history, and over the whole session so a skipped exercise shows up as skipped.
  const lifts = A.entries.map(e => {
    const prev = lastEntryFor(st, e.id)
    const best = prs.includes(e.id) || e1prs.some(p => p.id === e.id)
    return { id: e.id, v: liftVerdict({ sets: e.sets.filter(s => s.done), prevSets: prev && prev.sets, planned: e.sets.length, best }) }
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
  update(s => {
    w.entries.forEach(e => {
      const mx = Math.max(0, ...e.sets.filter(x => x.done).map(x => x.w || 0), e.topW || 0)
      if (mx > 0) { const cur = s.exWeights[e.id]; if (!cur || mx > cur.w) s.exWeights[e.id] = { w: mx, d: w.d } }
    })
    s.workouts.push(w)
    spendSwaps(s, w)
    s.active = null
  })
  useUI.getState().stopRest()
  beep(snd(), 880, 0.15); beep(snd(), 1100, 0.15, 0.18); beep(snd(), 1320, 0.3, 0.36)
  // judged against the last time this routine was done (the workout is already in the log, so
  // previousSession skips it), and against how much of the plan actually got checked off
  const prev = previousSession(S().workouts, w)
  const sv = sessionVerdict({ prs, e1prs, vol: w.vol || 0, prevVol: prev ? prev.vol || 0 : null })
  const feel = finishFeel({ sv, done, total })
  // what each exercise done today will be asked for next time — read from the log as it now stands,
  // so today's session is the one the engine builds on
  const after = S()
  const routine = (after.routines || []).find(r => r.id === w.routineId)
  const next = w.entries.map(e => ({ id: e.id, ask: nextAsk(nextPrescription(after, { ...(e.target || {}), id: e.id }, routine)) }))
    .filter(n => n.ask).map(n => ({ id: n.id, ...n.ask }))
  ui().openSheet(close => <FinishSummary w={w} lifts={lifts} next={next} feel={feel} close={close} />, { kind: 'full', locked: true })
}
