import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { backend } from '../lib/backend.js'
import { t } from '../lib/i18n.js'
import { Button, TextField } from './ui.jsx'
import ChooseData from './ChooseData.jsx'
import { useSignInFlow } from './useSignInFlow.js'

const toast = m => useUI.getState().toast(m)

// Sign in and sign up are the same thing here: mail a code, type it back. An address that has no
// account yet gets one. Off unless the build lists 'email' (lib/backend.js), since it needs custom SMTP.
//   name   — what to call a brand-new account (the onboarding already asked)
//   onDone — called once the person is signed in and their data is settled
export default function CodeSignIn({ name = '', onDone, primaryClass = '' }) {
  const [step, setStep] = useState('email')   // 'email' → 'code'
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const flow = useSignInFlow(onDone)
  const { busy, run } = flow

  const send = () => {
    const to = email.trim()
    if (!/^\S+@\S+\.\S+$/.test(to)) { toast(t('Enter a valid email')); return }
    run(async () => {
      await backend.sendCode(to, name || useStore.getState().S.name || '')
      setStep('code'); setCode('')
    })
  }

  const verify = () => run(async () => flow.settle(await backend.verifyCode(email.trim(), code.trim())))

  // both sides hold real data: nothing moves until the person picks
  if (flow.choosing) return <ChooseData busy={busy} onPick={flow.pick}
    onCancel={async () => { await flow.cancel(); setStep('email') }} />

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
