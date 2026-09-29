import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { webauthnOK, passkeyLogin, passkeyRegister, api, BIO } from '../lib/api.js'
import { hasData } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { useState, useEffect } from 'react'
import Orb from '../components/Orb.jsx'
import Icon from '../components/Icon.jsx'
import { DOWN } from '../lib/orb-rig.js'
import { Button } from '../components/ui.jsx'

// D4 — create account. The design asks for name, email and password with Apple/Google below;
// this app's accounts are a name plus a passkey and nothing else, so what's left is the name
// (and the invite code, on an invite-only server) and a line saying where the "password" went.
function CreateAccount({ onBack }) {
  const { setUser, pushState, pullState } = useStore()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [inviteOnly, setInviteOnly] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { api('/api/config').then(c => setInviteOnly(!!c.invite_only)).catch(() => {}) }, [])
  const go = async e => {
    e.preventDefault()
    const n = name.trim()
    if (!n) { useUI.getState().toast(t('Enter a name')); return }
    if (inviteOnly && !code.trim()) { useUI.getState().toast(t('An invite code is required')); return }
    setBusy(true)
    try {
      const u = await passkeyRegister(n, code.trim())
      setUser(u)
      if (hasData(useStore.getState().S)) { await pushState(); useUI.getState().toast(t('Profile created — data from this device moved into it')) }
      else { await pullState(); useUI.getState().toast(t('Welcome, {0}', u.name)) }
    } catch (e) {
      if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') useUI.getState().toast(e.message || t('Registration failed'))
      setBusy(false)
    }
  }
  return <form className="pk-step" onSubmit={go}>
    <div className="pk-nav on-orb">
      <button type="button" className="pk-back" onClick={onBack} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <span className="steps">{t('{0} of {1}', 1, 2)}</span>
    </div>
    <h1 className="pk-title">{t("Let's make your account.")}</h1>
    <div className="pk-fields">
      <input className="input" placeholder={t('Name')} maxLength={40} autoComplete="username" value={name} onChange={e => setName(e.target.value)} />
      {inviteOnly && <input className="input" placeholder={t('Invite code')} maxLength={40} value={code}
        onChange={e => setCode(e.target.value.toUpperCase())} style={{ letterSpacing: '.14em', fontWeight: 600 }} />}
      <div className="pk-note">{t('Pick a name, then confirm with {0}. The passkey is saved in your device — no password needed.', BIO)}
        {inviteOnly && ' ' + t('This app is invite-only — enter the code you were given.')}</div>
    </div>
    <div className="grow" />
    <div className="pk-actions">
      <Button variant="primary" type="submit" disabled={busy}>{t('Continue')}</Button>
    </div>
  </form>
}

// D1 — welcome. The orb hangs off the top of the screen looking down at the copy; the two
// slabs map onto what this app actually has: "Create account" is a passkey registration and
// "Sign in" a passkey sign-in (no email or password anywhere). Guest mode stays reachable as a
// quiet link — it is the only way in on a browser without passkeys.
function Welcome({ onCreate }) {
  const { setUser, pullState, setGuest } = useStore()
  const signIn = async () => {
    try { const u = await passkeyLogin(); setUser(u); await pullState(); useUI.getState().toast(t('Welcome back, {0}', u.name)) }
    catch (e) { if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') useUI.getState().toast(e.message || t('Sign-in failed')) }
  }
  const passkeys = webauthnOK()
  return <div className="pk-step">
    <div className="grow" />
    <div className="pk-hero">
      <h1>{t("Hey. I'm Peek.")}<br />{t("I'll be your coach.")}</h1>
      <p>{passkeys ? t("Make an account and we'll start with your first session.") : t("This browser doesn't support passkeys — you can still use openGym locally on this device.")}</p>
    </div>
    <div className="pk-actions">
      {passkeys ? <>
        <Button variant="primary" onClick={onCreate}>{t('Create account')}</Button>
        <Button variant="soft" onClick={signIn}>{t('Sign in')}</Button>
        <button className="pk-link" onClick={() => setGuest(true)}>{t('Continue without account')}</button>
      </> : <Button variant="primary" onClick={() => setGuest(true)}>{t('Continue without account')}</Button>}
    </div>
  </div>
}

// One orb for both steps, so going to "create account" slides it further up out of the way
// instead of swapping in a second one — the design's two screens are the same creature.
export default function Login() {
  const [step, setStep] = useState('welcome')
  const [seen, setSeen] = useState(false)
  return (
    <div className={'pk-full pk-onboard ' + step + (seen ? ' seen' : '')}>
      <Orb size={480} bias={[-22, 0, 0]} pool={DOWN} />
      {step === 'welcome' ? <Welcome onCreate={() => { setStep('create'); setSeen(true) }} /> : <CreateAccount onBack={() => setStep('welcome')} />}
    </div>
  )
}
