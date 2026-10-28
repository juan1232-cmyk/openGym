import { useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { backend } from '../lib/backend.js'
import { signInAction } from '../lib/sync.js'
import { t } from '../lib/i18n.js'
import { Button, TextField } from './ui.jsx'

const toast = m => useUI.getState().toast(m)

// Sign in and sign up are the same thing here: mail a code, type it back. An address that has no
// account yet gets one. Used by the onboarding's last step, its "sign in" button and Settings.
//   name   — what to call a brand-new account (the onboarding already asked)
//   onDone — called once the person is signed in and their data is settled
export default function CodeSignIn({ name = '', onDone, primaryClass = '' }) {
  const [step, setStep] = useState('email')   // 'email' → 'code' → (only if both sides hold data) 'choose'
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const found = useRef(null)                  // the signed-in user and the account's copy, while 'choose' is up

  const run = async fn => {
    setBusy(true)
    try { await fn() } catch (e) { toast(e.message || t('Something went wrong')) }
    finally { setBusy(false) }
  }

  const send = () => {
    const to = email.trim()
    if (!/^\S+@\S+\.\S+$/.test(to)) { toast(t('Enter a valid email')); return }
    run(async () => {
      await backend.sendCode(to, name || useStore.getState().S.name || '')
      setStep('code'); setCode('')
    })
  }

  // Settle which copy of the data wins, then finish. `act` is signInAction's answer, or the
  // person's pick when it was 'choose'.
  const finish = async (user, act, remote) => {
    const st = useStore.getState()
    st.setUser(user)
    if (act === 'adopt') st.adopt(remote)
    else if (act === 'push') await st.pushState()
    toast(t('Welcome, {0}', user.name))
    onDone?.(user)
  }

  const verify = () => run(async () => {
    const user = await backend.verifyCode(email.trim(), code.trim())
    const remote = await backend.getState()
    const act = signInAction(remote, useStore.getState().S)
    if (act === 'choose') { found.current = { user, remote }; setStep('choose'); return }
    await finish(user, act, remote)
  })

  if (step === 'choose') {
    const pick = act => run(() => finish(found.current.user, act, found.current.remote))
    return <div className="pk-actions">
      <div className="pk-note"><b>{t('This account already has data.')}</b> {t('So does this device. Which should you keep? The other is replaced.')}</div>
      <Button variant="primary" disabled={busy} onClick={() => pick('adopt')}>{t('Use my account’s data')}</Button>
      <Button variant="soft" disabled={busy} onClick={() => pick('push')}>{t('Keep this device’s data instead')}</Button>
      <Button variant="ghost" disabled={busy} onClick={() => run(async () => { await backend.signOut(); found.current = null; setStep('email') })}>{t('Cancel')}</Button>
    </div>
  }

  if (step === 'code') {
    return <div className="pk-actions">
      <div className="pk-note">{t('We sent a code to {0}. Enter it here.', email.trim())}</div>
      <TextField value={code} autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={10}
        placeholder={t('Code')} aria-label={t('Code')} style={{ letterSpacing: '.3em', fontWeight: 600, textAlign: 'center' }}
        onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
        onKeyDown={e => { if (e.key === 'Enter' && code.length >= 6) verify() }} />
      <Button variant="primary" className={primaryClass} disabled={busy || code.length < 6} onClick={verify}>{t('Sign in')}</Button>
      <Button variant="ghost" disabled={busy} onClick={() => setStep('email')}>{t('Use a different email')}</Button>
    </div>
  }

  return <div className="pk-actions">
    <TextField type="email" value={email} autoFocus autoComplete="email" inputMode="email" placeholder={t('Email')} aria-label={t('Email')}
      onChange={e => setEmail(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send() }} />
    <Button variant="primary" className={primaryClass} icon="key" disabled={busy || !email.trim()} onClick={send}>{t('Email me a code')}</Button>
    <div className="pk-note">{t('No password. We email a code; new addresses get an account, and everything syncs to every device you sign in on.')}</div>
  </div>
}
