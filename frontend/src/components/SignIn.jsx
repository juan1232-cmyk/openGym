import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { backend, EMAIL_CODE, PROVIDER_NAME } from '../lib/backend.js'
import { cleanUsername, usernameProblem, passwordProblem, suggestUsername } from '../lib/username.js'
import { t } from '../lib/i18n.js'
import { Button, TextField } from './ui.jsx'
import ChooseData from './ChooseData.jsx'
import CodeSignIn from './CodeSignIn.jsx'
import { useSignInFlow } from './useSignInFlow.js'

const toast = m => useUI.getState().toast(m)

// What a failed request says to the person, by Supabase's error code. Anything not listed shows
// the server's own sentence.
const explain = e => ({
  user_already_exists: t('That username is taken. Pick another, or sign in.'),
  invalid_credentials: t('Wrong username or password.'),
  over_request_rate_limit: t('Too many tries. Wait a minute and try again.'),
  confirm_required: t('Creating accounts isn’t switched on yet.'),
  signup_disabled: t('Creating accounts isn’t switched on yet.'),
  email_address_invalid: t('Accounts aren’t available right now. You can keep using openGym on this device.')
}[e.code])

// Every way of signing in to a hosted account, in one place: a username and password, a button
// per provider, then the emailed code. Only what the project has actually switched on is shown
// (backend.available), so nobody meets a dead end. Signing in and making an account are one step
// for providers and the code; the password form has both modes. Used by the onboarding's last
// step, its "Sign in" button and Settings.
//   name  — what to call a brand-new account (the onboarding already asked)
//   mode  — which the password form opens on: 'create' (default) or 'in'
export default function SignIn({ name = '', onDone, primaryClass = '', mode: first = 'create' }) {
  const [avail, setAvail] = useState(null)
  const [going, setGoing] = useState(null)   // the provider whose page we are about to leave for
  const flow = useSignInFlow(onDone)

  useEffect(() => {
    let live = true
    backend.available().then(a => live && setAvail(a))
    return () => { live = false }
  }, [])

  // both sides hold real data: nothing moves until the person picks
  if (flow.choosing) return <ChooseData busy={flow.busy} onPick={flow.pick} onCancel={flow.cancel} />
  if (!avail) return null

  const go = async provider => {
    setGoing(provider)
    // on success the page navigates away, so there is nothing to reset; only a failure comes back here
    try { await backend.signInWithProvider(provider) }
    catch (e) {
      toast(e.code === 'provider_off' ? t('{0} sign-in isn’t set up yet.', PROVIDER_NAME[provider] || provider) : e.message || t('Something went wrong'))
      setGoing(null)
    }
  }

  const nothing = !avail.password && !avail.oauth.length && !EMAIL_CODE
  return <>
    {avail.password && <PasswordForm name={name} first={first} flow={flow} primaryClass={primaryClass} />}
    {!!avail.oauth.length && <div className="pk-actions" style={avail.password ? { marginTop: 10 } : undefined}>
      {avail.oauth.map(p => <Button key={p} variant={avail.password ? 'soft' : 'primary'} className={primaryClass} disabled={!!going || flow.busy} onClick={() => go(p)}>
        {t('Continue with {0}', PROVIDER_NAME[p] || p)}
      </Button>)}
    </div>}
    {EMAIL_CODE && <CodeSignIn name={name} onDone={onDone} primaryClass={primaryClass} />}
    {nothing && <div className="pk-actions"><div className="pk-note">{t('Accounts aren’t available right now. You can keep using openGym on this device.')}</div></div>}
  </>
}

function PasswordForm({ name, first, flow, primaryClass }) {
  const [mode, setMode] = useState(first)
  const [user, setUser] = useState(() => (first === 'create' ? suggestUsername(name || useStore.getState().S.name) : ''))
  const [pw, setPw] = useState('')
  const creating = mode === 'create'

  const submit = () => {
    const u = cleanUsername(user)
    const problem = usernameProblem(u) || passwordProblem(pw, creating)
    if (problem) { toast(t(problem)); return }
    flow.run(async () => {
      const who = creating
        ? await backend.signUpWithPassword(u, pw, name || useStore.getState().S.name || '')
        : await backend.signInWithPassword(u, pw)
      await flow.settle(who)
    }, explain)
  }

  return <div className="pk-actions">
    <TextField value={user} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
      placeholder={t('Username')} aria-label={t('Username')} onChange={e => setUser(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') submit() }} />
    <TextField type="password" value={pw} autoComplete={creating ? 'new-password' : 'current-password'}
      placeholder={t('Password')} aria-label={t('Password')} onChange={e => setPw(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') submit() }} />
    <Button variant="primary" className={primaryClass} disabled={flow.busy || !user.trim() || !pw} onClick={submit}>
      {creating ? t('Create account') : t('Sign in')}
    </Button>
    {creating && <div className="pk-note">{t('No email needed. There’s no password reset, so keep this somewhere safe.')}</div>}
    <button type="button" className="pk-link" onClick={() => setMode(creating ? 'in' : 'create')}>
      {creating ? t('I already have an account') : t('Create a new account')}
    </button>
  </div>
}
