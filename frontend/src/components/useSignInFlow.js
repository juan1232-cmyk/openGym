import { useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { backend } from '../lib/backend.js'
import { signInAction } from '../lib/sync.js'
import { t } from '../lib/i18n.js'

const toast = m => useUI.getState().toast(m)

// What every in-page sign-in form (the password one, the emailed code) does once it has a signed-in
// user: work out which copy of the data wins (lib/sync.js signInAction), ask the person if both
// sides hold real data, then finish. The forms differ only in how they get the user.
//   busy       — a request is running
//   run(fn, explain?) — runs fn with `busy` set; an error becomes a toast (`explain(e)` may supply
//                its text, and return falsy to fall back to the error's own message)
//   settle(user)      — call with the freshly signed-in user
//   choosing, pick, cancel — the "which copy do you keep?" step, for <ChooseData>
export function useSignInFlow(onDone) {
  const [busy, setBusy] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const found = useRef(null)   // the signed-in user and the account's copy, while the question is up

  const run = async (fn, explain) => {
    setBusy(true)
    try { await fn() } catch (e) { toast((explain && explain(e)) || e.message || t('Something went wrong')) }
    finally { setBusy(false) }
  }

  const finish = async (user, act, remote) => {
    await useStore.getState().finishSignIn(user, act, remote)
    toast(t('Welcome, {0}', user.name))
    onDone?.(user)
  }

  const settle = async user => {
    const remote = await backend.getState()
    const act = signInAction(remote, useStore.getState().S)
    if (act === 'choose') { found.current = { user, remote }; setChoosing(true); return }
    await finish(user, act, remote)
  }

  const pick = act => run(() => finish(found.current.user, act, found.current.remote))
  // Backs out: signs the account out again and leaves this device's data exactly as it was.
  const cancel = () => run(async () => { await backend.signOut(); found.current = null; setChoosing(false) })

  return { busy, run, settle, choosing, pick, cancel }
}
