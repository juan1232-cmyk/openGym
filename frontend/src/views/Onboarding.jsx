import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore, hasData } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { webauthnOK, passkeyLogin, passkeyRegister, api, BIO } from '../lib/api.js'
import { t } from '../lib/i18n.js'
import { EXIDX } from '../lib/exercises.js'
import { GOALS, LEVELS, KITS, MODES, MAX_DAYS, MON_FIRST, withDefaults, planFor, commitAnswers, becauseRows } from '../lib/onboard.js'
import { DAYN } from '../lib/format.js'
import Orb from '../components/Orb.jsx'
import Say from '../components/Say.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const wait = ms => new Promise(r => setTimeout(r, reducedMotion() ? 0 : ms))
const toast = m => useUI.getState().toast(m)

// The questions, in order. The dots under the back arrow count these.
const QUESTIONS = ['name', 'goal', 'level', 'kit', 'days']
const ORB = 480   // drawn at the welcome screen's size and scaled down everywhere else, so it stays sharp

// Where Peek sits on each kind of screen: x, y of its top-left (px inside the screen, `sat`
// = the safe-area top) and the size it's drawn at. The welcome slot is the old .pk-onboard one.
const SLOTS = {
  hello: (w, sat) => ({ x: w / 2 - ORB / 2, y: innerHeight <= 720 ? -230 : -150, size: ORB }),
  ask: (w, sat) => ({ x: 24, y: sat + 76, size: 62 }),
  centre: (w, sat) => ({ x: w / 2 - 48, y: sat + 64, size: 96 }),
  save: (w, sat) => ({ x: w / 2 - 84, y: sat + 110, size: 168 })
}
const slotOf = step => (step === 'hello' ? 'hello' : step === 'reveal' ? 'centre' : step === 'save' ? 'save' : 'ask')

// The new-profile flow, replacing the old welcome → create account → goals screens. Peek gets
// to know you and says what each answer does in the app (lib/onboard.js keeps those lines next
// to the effects), you choose who makes the plan, and the account comes last — so a passkey
// is the last thing asked for, not the first. Answers commit in one update() before any
// account exists; registering then moves them into it (the hasData → pushState branch below).
// `resume` = a signed-in profile with nothing in it (see needsGoals): no welcome, no name,
// no account step — it starts at the goal.
export default function Onboarding() {
  const user = useStore(s => s.user)
  const S = useStore(s => s.S)
  const { update, setUser, setGuest, pushState, pullState } = useStore.getState()
  const resume = !!user
  // answers committed but no account yet (the app was closed on the account step): pick up there
  const [step, setStep] = useState(resume ? 'goal' : (S.goal && S.toured === false && webauthnOK()) ? 'save' : 'hello')
  const [A, setA] = useState(() => ({ name: user?.name || S.name || '', goal: null, level: null, kit: null, weekdays: [], unit: S.unit, mode: null, account: true }))
  const [line, setLine] = useState(null)        // { text, key } — what Peek is saying
  const [leaving, setLeaving] = useState(false)
  const [glide, setGlide] = useState(false)
  const [box, setBox] = useState({ w: 375, sat: 0 })
  const orb = useRef(null), root = useRef(null), satProbe = useRef(null)
  const plan = useRef(null)
  const run = useRef(0)   // bumps on every step change, so a pending wait() from the last one does nothing
  const set = patch => setA(a => ({ ...a, ...patch }))

  useLayoutEffect(() => {
    const measure = () => setBox({ w: root.current?.offsetWidth || 375, sat: satProbe.current?.offsetHeight || 0 })
    measure()
    addEventListener('resize', measure)
    return () => removeEventListener('resize', measure)
  }, [])

  const say = text => setLine({ text, key: Date.now() })
  const go = (next, { slow } = {}) => {
    const r = ++run.current
    setLine(null)
    if (!slow) { setStep(next); return }
    // welcome ⇄ name: the screen fades out, Peek glides across in one long even move, and the
    // next screen fades in as it arrives — instead of everything swapping at once
    setLeaving(true)
    wait(320).then(() => {
      if (r !== run.current) return
      setLeaving(false); setGlide(true); setStep(next)
      wait(1200).then(() => r === run.current && setGlide(false))
    })
  }
  const alive = r => r === run.current

  // what Peek says on arriving at each step
  useEffect(() => {
    const r = run.current
    const lines = {
      name: t('I’m Peek. I’ll track your sessions and tell you when to add weight. What should I call you?'),
      goal: t('What are you training for, {0}?', A.name.trim() || t('friend')),
      level: t('How long have you been lifting?'),
      kit: t('Where do you train?'),
      days: t('Which days do you usually train?'),
      plan: t('Last thing. Will you make your plan, or should I?'),
      save: t('Now your account, {0}. Everything you told me goes with it.', A.name.trim() || t('friend'))
    }
    if (step === 'hello') orb.current?.look(-22, 0)   // looking down at the copy, as the old welcome did
    if (!lines[step]) return
    orb.current?.look()
    wait(glide ? 1050 : 250).then(() => alive(r) && say(lines[step]))
  }, [step])

  const pick = (key, o) => {
    set({ [key]: o.k })
    orb.current?.react(o.react, o.react === 'angry-brows' ? 1400 : 900)
    orb.current?.bump('lift')
    say(t(o.line))
  }

  const commit = () => {
    update(s => commitAnswers(s, A, plan.current))
    if (resume) return                         // signed in already: the app moves on by itself
    if (A.account) go('save')
    else setGuest(true)
  }

  const slot = SLOTS[slotOf(step)](box.w, box.sat)
  const mood = step === 'hello' ? 'down' : step === 'reveal' ? 'happy' : 'curious'
  const qi = QUESTIONS.indexOf(step)
  const back = { name: 'hello', goal: resume ? null : 'name', level: 'goal', kit: 'level', days: 'kit', plan: 'days', reveal: 'plan', save: null }[step]

  return (
    <div ref={root} className={'pk-full ob at-' + step + (leaving ? ' leaving' : '') + (glide ? ' gliding' : '')}>
      <div className="ob-sat" ref={satProbe} />
      <div className={'ob-orb' + (glide ? ' glide' : '')} style={{ transform: `translate(${slot.x}px,${slot.y}px) scale(${slot.size / ORB})` }}>
        <Orb ref={orb} size={ORB} mood={mood} className={step === 'hello' && !glide ? 'ob-peekin' : ''} />
      </div>
      {line && <Bubble key={line.key} step={step} slot={slot} box={box} text={line.text} orb={orb} />}

      {step !== 'hello' && <div className="pk-nav ob-nav">
        {back ? <button type="button" className="pk-back" aria-label={t('Back')} onClick={() => go(back, { slow: back === 'hello' })}><Icon name="chevronLeft" /></button> : <span />}
        {qi >= 0 && <span className="ob-dots" aria-label={t('{0} of {1}', qi + 1, QUESTIONS.length)}>{QUESTIONS.map((q, i) => <i key={q} className={i === qi ? 'on' : i < qi ? 'done' : ''} />)}</span>}
      </div>}

      <div key={step} className={'ob-step' + (glide ? ' late' : '')}>
        {step === 'hello' && <Welcome onStart={account => { set({ account }); go('name', { slow: true }) }} />}
        {step === 'name' && <NameStep A={A} set={set} orb={orb} onNext={async () => {
          const r = run.current
          orb.current?.react('joyful-wide', 1200); orb.current?.bump('lift')
          say(t('{0}. Nice to meet you.', A.name.trim()))
          await wait(1300); if (alive(r)) go('goal')
        }} />}
        {step === 'goal' && <Choices options={GOALS} value={A.goal} onPick={o => pick('goal', o)} onNext={() => go('level')} onSkip={() => go('days')} />}
        {step === 'level' && <Choices options={LEVELS} value={A.level} onPick={o => pick('level', o)} onNext={() => go('kit')} onSkip={() => go('days')} />}
        {step === 'kit' && <Choices options={KITS} value={A.kit} onPick={o => pick('kit', o)} onNext={() => go('days')} onSkip={() => go('days')} />}
        {step === 'days' && <DaysStep A={A} set={set} orb={orb} say={say} onNext={() => go('plan')} />}
        {step === 'plan' && <Choices options={MODES} value={A.mode} onPick={o => pick('mode', o)}
          onNext={() => { if (A.mode === 'you') { plan.current = planFor(A); go('reveal') } else { plan.current = null; commit() } }} />}
        {step === 'reveal' && <Reveal A={A} plan={plan.current} orb={orb} say={say} run={run} onDone={commit} />}
        {step === 'save' && <SaveStep name={A.name} orb={orb} say={say} setUser={setUser} setGuest={setGuest} pushState={pushState} pullState={pullState} />}
      </div>
    </div>
  )
}

// Peek's speech bubble, placed by the slot it's sitting in: beside it on the question screens
// (the tail points back at it), under it everywhere else.
function Bubble({ step, slot, box, text, orb }) {
  const beside = slotOf(step) === 'ask'
  const style = beside
    ? { left: slot.x + slot.size + 10, top: slot.y + slot.size, maxWidth: box.w - (slot.x + slot.size + 10) - 20 }
    : { top: slot.y + slot.size + 16 }
  return <div className={'ob-say ' + (beside ? 'beside' : 'under')} style={style}>
    <Say text={text} orb={orb} className={beside ? '' : 'up'} />
  </div>
}

// D1 — welcome, as it was: the orb hangs off the top looking down at the copy. Create account
// and Continue without account both go into the questions; the account itself is made at the
// end (or not at all). Sign in is the passkey sign-in it always was.
function Welcome({ onStart }) {
  const { setUser, pullState } = useStore.getState()
  const signIn = async () => {
    try { const u = await passkeyLogin(); setUser(u); await pullState(); toast(t('Welcome back, {0}', u.name)) }
    catch (e) { if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') toast(e.message || t('Sign-in failed')) }
  }
  const passkeys = webauthnOK()
  return <div className="pk-step ob-welcome">
    <div className="grow" />
    <div className="pk-hero">
      <h1>{t("Hey. I'll be your coach.")}</h1>
      <p>{passkeys ? t("Make an account and we'll start with your first session.") : t("This browser doesn't support passkeys — you can still use openGym locally on this device.")}</p>
    </div>
    <div className="pk-actions">
      {passkeys ? <>
        <Button variant="primary" onClick={() => onStart(true)}>{t('Create account')}</Button>
        <Button variant="soft" onClick={signIn}>{t('Sign in')}</Button>
        <button className="pk-link" onClick={() => onStart(false)}>{t('Continue without account')}</button>
      </> : <Button variant="primary" onClick={() => onStart(false)}>{t('Continue without account')}</Button>}
    </div>
  </div>
}

function NameStep({ A, set, orb, onNext }) {
  const typed = useRef(0)
  const [sent, setSent] = useState(false)
  const ok = !!A.name.trim() && !sent
  const submit = e => { e.preventDefault(); if (!ok) return; setSent(true); onNext() }
  return <form className="pk-step ob-q" onSubmit={submit}>
    <input className="input" placeholder={t('Your name')} maxLength={40} autoComplete="username" value={A.name} aria-label={t('Your name')}
      onFocus={() => orb.current?.look(-18, 14)} onBlur={() => orb.current?.look()}
      onChange={e => { set({ name: e.target.value }); if (++typed.current % 3 === 0) orb.current?.bump('nod') }} />
    <div className="pk-note">{A.account ? t('Used for your account. Peek will greet you with it.') : t('Only used on this device. Peek will greet you with it.')}</div>
    <div className="grow" />
    <div className="pk-actions"><Button variant="primary" type="submit" disabled={!ok}>{t('Continue')}</Button></div>
  </form>
}

function Choices({ options, value, onPick, onNext, onSkip }) {
  return <div className="pk-step ob-q">
    <div className="pk-choices" role="radiogroup">
      {options.map(o => (
        <button key={o.k} role="radio" aria-checked={value === o.k} className={'pk-choice' + (value === o.k ? ' on' : '')} onClick={() => onPick(o)}>
          <span className="txt"><b>{t(o.name)}</b><span>{t(o.sub)}</span></span>
          <span className="tick">{value === o.k && <Icon name="check" />}</span>
        </button>
      ))}
    </div>
    <div className="grow" />
    <div className="pk-actions">
      <Button variant="primary" disabled={!value} onClick={onNext}>{t('Continue')}</Button>
      {onSkip && <button className="pk-link" onClick={onSkip}>{t('Skip, use the defaults')}</button>}
    </div>
  </div>
}

// Seven day toggles, all off: nothing is decided for you. Six at most — Peek keeps a rest day.
function DaysStep({ A, set, orb, say, onNext }) {
  const [popped, setPopped] = useState(null)
  const toggle = d => {
    const on = A.weekdays.includes(d)
    if (!on && A.weekdays.length >= MAX_DAYS) {
      orb.current?.react('skeptical-left', 1200); orb.current?.bump('nod')
      return say(t('Keep one rest day. That’s when your muscles actually grow.'))
    }
    const next = on ? A.weekdays.filter(x => x !== d) : [...A.weekdays, d]
    set({ weekdays: next }); setPopped(d)
    const n = next.length
    if (!n) return say(t('Tap the days you usually train.'))
    orb.current?.react(n === MAX_DAYS ? 'surprised-wide-left' : 'joyful-down-right', 900); orb.current?.bump('lift')
    say(n === 1 ? t('1 training day. In Plan it’ll be waiting for a routine.') : t('{0} training days. In Plan they’ll be waiting for a routine.', n))
  }
  const unit = u => { set({ unit: u }); orb.current?.bump('nod'); say(u === 'kg' ? t('Kilos. Every weight in the app will be in kg.') : t('Pounds. Every weight in the app will be in lb.')) }
  const n = A.weekdays.length
  const names = MON_FIRST.filter(d => A.weekdays.includes(d)).map(d => t(DAYN[d]).slice(0, 3)).join(', ')
  return <div className="pk-step ob-q">
    <div className="pk-label">{t('Days you train')}</div>
    <div className="ob-week" role="group" aria-label={t('Days you train')}>
      {MON_FIRST.map(d => {
        const on = A.weekdays.includes(d)
        return <button key={d} className={(on ? 'on' : '') + (popped === d ? ' pop' : '')} aria-pressed={on} aria-label={t(DAYN[d])} onClick={() => toggle(d)}>
          <b>{t(DAYN[d]).slice(0, 1)}</b><i />
        </button>
      })}
    </div>
    <div className="ob-daysum">{n ? (n === 1 ? t('1 day a week') : t('{0} days a week', n)) + ' · ' + names : t('Nothing picked yet')}</div>
    <div className="pk-label">{t('Weights in')}</div>
    <div className="pk-seg two" role="radiogroup" aria-label={t('Weights in')}>
      {['kg', 'lb'].map(u => <button key={u} role="radio" aria-checked={A.unit === u} className={A.unit === u ? 'on' : ''} onClick={() => unit(u)}>{u}</button>)}
    </div>
    <div className="grow" />
    <div className="pk-actions"><Button variant="primary" disabled={!n} onClick={onNext}>{t('Continue')}</Button></div>
  </div>
}

// "You make it": Peek thinks it over, then the routines come in one at a time, then what each
// answer did. Nothing is saved until Looks good.
function Reveal({ A, plan, orb, say, run, onDone }) {
  const [shown, setShown] = useState(0)
  const [why, setWhy] = useState(false)
  useEffect(() => {
    const r = run.current
    orb.current?.react('upward-side-glance', 2000)
    say(t('Let me put this together…'))
    ;(async () => {
      await wait(1700); if (r !== run.current) return
      orb.current?.bump('lift')
      say(t('Here’s your week, {0}. Change anything you like in Plan.', A.name.trim() || t('friend')))
      for (let i = 1; i <= plan.routines.length; i++) { await wait(i === 1 ? 120 : 220); if (r !== run.current) return; setShown(i) }
      await wait(250); if (r === run.current) setWhy(true)
    })()
  }, [])
  const dayOf = id => MON_FIRST.filter(d => plan.week[d] === id).map(d => t(DAYN[d]).slice(0, 3)).join(' · ')
  return <div className="pk-step ob-reveal">
    <div className="ob-plan">
      {plan.routines.slice(0, shown).map(r => <div key={r.id} className="card ob-rcard">
        <div className="top"><h3>{t(r.name)}</h3><span className="days">{dayOf(r.id)}</span></div>
        <ul>{r.ex.slice(0, 4).map(e => <li key={e.id}><span className="capitalize">{(EXIDX[e.id] || {}).n}</span><span className="v">{e.sets}×{e.reps}</span></li>)}
          {r.ex.length > 4 && <li className="more">{t('+{0} more', r.ex.length - 4)}</li>}</ul>
      </div>)}
      {why && <div className="ob-because">
        <h4>{t('Because you said')}</h4>
        {becauseRows(withDefaults(A)).map((row, i) => <div key={i}><span>{t(...row.said)}</span><b>{t(...row.did)}</b></div>)}
      </div>}
    </div>
    {why && <div className="pk-actions ob-in"><Button variant="primary" onClick={onDone}>{t('Looks good')}</Button></div>}
  </div>
}

// The account, last. A passkey makes it (registering moves everything answered so far into it,
// the way the old create-account screen did); "not now" keeps it all on this device as a guest.
function SaveStep({ name, orb, say, setUser, setGuest, pushState, pullState }) {
  const [inviteOnly, setInviteOnly] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { api('/api/config').then(c => setInviteOnly(!!c.invite_only)).catch(() => {}) }, [])
  const create = async () => {
    const n = (name || '').trim() || useStore.getState().S.name || ''
    if (!n) { toast(t('Enter a name')); return }
    if (inviteOnly && !code.trim()) { orb.current?.react('skeptical-left', 1200); say(t('I need the invite code first.')); return }
    setBusy(true)
    orb.current?.react('eyes-closed', 1500)
    try {
      const u = await passkeyRegister(n, code.trim())
      setUser(u)
      if (hasData(useStore.getState().S)) await pushState()
      else await pullState()
      toast(t('Welcome, {0}', u.name))
    } catch (e) {
      if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') toast(e.message || t('Registration failed'))
      setBusy(false)
    }
  }
  return <div className="pk-step ob-save">
    <div className="grow" />
    <div className="pk-actions">
      {inviteOnly && <>
        <input className="input" placeholder={t('Invite code')} maxLength={40} value={code} aria-label={t('Invite code')}
          onChange={e => setCode(e.target.value.toUpperCase())} style={{ letterSpacing: '.14em', fontWeight: 600 }} />
        <div className="pk-note">{t('This app is invite-only — enter the code you were given.')}</div>
      </>}
      <Button variant="primary" icon="key" disabled={busy} onClick={create}>{t('Create account')}</Button>
      <Button variant="soft" disabled={busy} onClick={() => setGuest(true)}>{t('Not now, keep it on this device')}</Button>
      <div className="pk-note ob-center">{t('You’ll confirm with {0}. The passkey is saved in your device — no password needed, and everything syncs to every device you sign in on.', BIO)}</div>
    </div>
  </div>
}
