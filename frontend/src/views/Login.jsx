import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { webauthnOK, passkeyLogin, passkeyRegister, api, BIO } from '../lib/api.js'
import { hasData } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { useState, useRef, useEffect } from 'react'
import Orb from '../components/Orb.jsx'
import { DOWN } from '../lib/orb-rig.js'
import { Button } from '../components/ui.jsx'

function RegisterSheet({ close }) {
  const { setUser, pushState, pullState } = useStore()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [inviteOnly, setInviteOnly] = useState(false)
  const ref = useRef(null)
  useEffect(() => { setTimeout(() => ref.current?.focus(), 250) }, [])
  useEffect(() => { api('/api/config').then(c => setInviteOnly(!!c.invite_only)).catch(() => {}) }, [])
  const go = async () => {
    const n = name.trim()
    if (!n) { useUI.getState().toast(t('Enter a name')); return }
    if (inviteOnly && !code.trim()) { useUI.getState().toast(t('An invite code is required')); return }
    try {
      const u = await passkeyRegister(n, code.trim())
      setUser(u); close()
      if (hasData(useStore.getState().S)) { await pushState(); useUI.getState().toast(t('Profile created — data from this device moved into it')) }
      else { await pullState(); useUI.getState().toast(t('Welcome, {0}', u.name)) }
    } catch (e) { if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') useUI.getState().toast(e.message || t('Registration failed')) }
  }
  return <>
    <h3>{t('Create your profile')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>{t('Pick a name, then confirm with {0}. The passkey is saved in your device — no password needed.', BIO)}</div>
    <input ref={ref} className="input" placeholder={t('Your name')} maxLength={40} value={name} onChange={e => setName(e.target.value)} />
    {inviteOnly && <>
      <div style={{ height: 10 }} />
      <input className="input" placeholder={t('Invite code')} maxLength={40} value={code}
        onChange={e => setCode(e.target.value.toUpperCase())} style={{ letterSpacing: '.14em', fontWeight: 600, textAlign: 'center' }} />
      <div className="dim small" style={{ marginTop: 6 }}>{t('This app is invite-only — enter the code you were given.')}</div>
    </>}
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={go}>{t('Create passkey')}</Button>
  </>
}

// D1 — the welcome screen from the Peek design. The orb hangs off the top of the screen looking
// down at the copy; the two slabs map onto what this app actually has: "Create account" is a
// passkey registration and "Sign in" a passkey sign-in (no email or password anywhere). Guest
// mode stays reachable as a quiet link — it is the only way in on a browser without passkeys.
export default function Login() {
  const { setUser, pullState, setGuest } = useStore()
  const signIn = async () => {
    try { const u = await passkeyLogin(); setUser(u); await pullState(); useUI.getState().toast(t('Welcome back, {0}', u.name)) }
    catch (e) { if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') useUI.getState().toast(e.message || t('Sign-in failed')) }
  }
  const passkeys = webauthnOK()

  return (
    <div className="pk-full pk-welcome">
      <Orb size={480} bias={[-22, 0, 0]} pool={DOWN} />
      <div className="grow" />
      <div className="pk-hero">
        <h1>{t("Hey. I'll be your coach.")}</h1>
        <p>{passkeys ? t("Make an account and we'll start with your first session.") : t("This browser doesn't support passkeys — you can still use openGym locally on this device.")}</p>
      </div>
      <div className="pk-actions">
        {passkeys ? <>
          <Button variant="primary" onClick={() => useUI.getState().openSheet(close => <RegisterSheet close={close} />)}>{t('Create account')}</Button>
          <Button variant="soft" onClick={signIn}>{t('Sign in')}</Button>
          <button className="pk-link" onClick={() => setGuest(true)}>{t('Continue without account')}</button>
        </> : <Button variant="primary" onClick={() => setGuest(true)}>{t('Continue without account')}</Button>}
      </div>
    </div>
  )
}
