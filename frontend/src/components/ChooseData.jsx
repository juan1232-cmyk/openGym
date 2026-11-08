import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { backend } from '../lib/backend.js'
import { t } from '../lib/i18n.js'
import { Button } from './ui.jsx'

// Signed in, and both this device and the account hold real training data: nothing is merged and
// nothing is overwritten until the person says which copy to keep (lib/sync.js signInAction).
//   onPick('adopt' | 'push') — 'adopt' keeps the account's data, 'push' keeps this device's
//   onCancel                 — signs back out and leaves this device's data as it was
export default function ChooseData({ busy, onPick, onCancel }) {
  return <div className="pk-actions">
    <div className="pk-note"><b>{t('This account already has data.')}</b> {t('So does this device. Which should you keep? The other is replaced.')}</div>
    <Button variant="primary" disabled={busy} onClick={() => onPick('adopt')}>{t('Use my account’s data')}</Button>
    <Button variant="soft" disabled={busy} onClick={() => onPick('push')}>{t('Keep this device’s data instead')}</Button>
    <Button variant="ghost" disabled={busy} onClick={onCancel}>{t('Cancel')}</Button>
  </div>
}

// The same question when it comes up after a provider's redirect, where there is no sign-in form
// on screen to host it: App opens this as a locked sheet for the store's `pendingChoice`.
export function ChooseSheet({ close }) {
  const [busy, setBusy] = useState(false)
  const run = async fn => {
    setBusy(true)
    try { await fn() } catch (e) { useUI.getState().toast(e.message || t('Something went wrong')); setBusy(false); return }
    close()
  }
  const pick = act => run(async () => {
    const { user, remote } = useStore.getState().pendingChoice
    await useStore.getState().finishSignIn(user, act, remote)
    useStore.setState({ pendingChoice: null, signInResult: { name: user.name } })
  })
  const cancel = () => run(async () => {
    await backend.signOut()
    useStore.setState({ pendingChoice: null })
  })
  return <>
    <h3>{t('Which data do you keep?')}</h3>
    <ChooseData busy={busy} onPick={pick} onCancel={cancel} />
  </>
}
