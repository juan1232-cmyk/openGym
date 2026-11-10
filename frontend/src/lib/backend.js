// The one place the app talks to an account/sync server. Two interchangeable backends:
//   - Supabase, when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set at build time (the hosted
//     app): email-code sign-in, and the whole profile as one row in `user_state`.
//   - the self-hosted server in api/ (passkeys, JSON files), otherwise.
// The store only ever calls the methods below, so it doesn't know which one it has. Both throw an
// Error with `.status` (401 = not signed in), which is what the store's boot() already expects.
import { createClient } from '@supabase/supabase-js'
import { api } from './api.js'
import { toEmail } from './username.js'

const URL = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
export const SUPABASE = !!(URL && KEY)

// 'code' = hosted accounts on Supabase (a provider's sign-in, or an emailed 6-digit code);
// 'passkey' = WebAuthn against api/
export const AUTH = SUPABASE ? 'code' : 'passkey'

// Which ways to sign in the hosted app may offer, set at build time (VITE_AUTH_PROVIDERS, comma
// separated). 'password' is a username and password (no email involved); 'email' is the emailed
// code, which needs custom SMTP before anyone but the project owner can receive it; anything else
// is an OAuth provider, a button each. Apple is a one-word addition here, but needs a paid Apple
// developer account to switch on. What is listed is only what is *allowed*: backend.available()
// asks the project which of these are actually switched on, so nobody meets a dead button.
const LISTED = (import.meta.env.VITE_AUTH_PROVIDERS || 'password,google').split(',').map(s => s.trim()).filter(Boolean)
export const OAUTH = SUPABASE ? LISTED.filter(p => p !== 'email' && p !== 'password') : []
export const PASSWORD = SUPABASE && LISTED.includes('password')
export const EMAIL_CODE = SUPABASE && LISTED.includes('email')
export const PROVIDER_NAME = { google: 'Google', apple: 'Apple' }

// Set just before leaving for a provider's sign-in page, read once on the way back: the return
// is a page load, so this is how boot() knows the session it finds was an explicit sign-in (which
// must not be settled with "newest wins", see lib/sync.js signInAction) and not an old one.
export const SIGNING_IN = 'gym_signing_in'

// Web push (rest-timer alerts, workout reminders), the live-workout heartbeat and the admin
// dashboard are routes of the self-hosted api/ only. On Supabase they have no server to call,
// so the UI for them stays hidden rather than failing.
export const SERVER_EXTRAS = !SUPABASE

// A workout in progress is device-local on both backends (api/server.js drops it the same way).
const stripActive = ({ active, ...rest }) => rest

const legacy = {
  me: async () => (await api('/api/me')).user,
  getState: async () => (await api('/api/data')).state,
  putState: state => api('/api/data', { method: 'PUT', body: JSON.stringify({ state }) }),
  signOut: () => api('/api/logout', { method: 'POST', body: '{}' }),
  signOutAll: () => api('/api/logout/all', { method: 'POST', body: '{}' }),
}

const unauthorized = () => Object.assign(new Error('not signed in'), { status: 401 })
const fail = e => { throw Object.assign(new Error(e.message), { status: e.status, code: e.code }) }
const asUser = u => ({ id: u.id, name: u.user_metadata?.name || u.user_metadata?.full_name || u.email?.split('@')[0] || '', admin: false })

// The project's public auth settings (no session needed): which providers are on, and whether a new
// account is signed in at once (`mailer_autoconfirm`) rather than waiting on a confirmation email.
// null if it can't be read, which callers treat as "unknown, go ahead".
let settingsP = null
const projectSettings = () => settingsP ||= fetch(`${URL}/auth/v1/settings`, { headers: { apikey: KEY } })
  .then(r => r.json())
  .then(s => ({ external: s.external || {}, autoconfirm: !!s.mailer_autoconfirm }), () => null)

function supabase() {
  // The anon key is public by design: it only identifies the project. What protects the data is
  // row-level security on `user_state` (supabase/migrations), never this key.
  // PKCE, not the implicit flow: the way back from a provider carries `?code=` in the query string,
  // where the implicit flow would put tokens in the #fragment this app's HashRouter already uses
  // for its routes. The client swaps the code for a session by itself, before getSession answers.
  const sb = createClient(URL, KEY, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  // getSession reads the stored session without a network call, so the app still boots offline.
  const session = async () => {
    const { data, error } = await sb.auth.getSession()
    if (error) fail(error)
    if (!data.session) throw unauthorized()
    return data.session
  }
  return {
    me: async () => asUser((await session()).user),
    // Step one of signing in or up: mail a code. `name` only matters the first time, and is kept on the user.
    sendCode: async (email, name) => {
      const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, data: name ? { name } : undefined } })
      if (error) fail(error)
    },
    // Leaves the page for the provider; the app is reloaded on the way back and boot() finishes the job.
    signInWithProvider: async provider => {
      // Supabase answers a provider that isn't switched on with a bare JSON error page, and the
      // redirect would strand the person on it. Its public settings say which are on, so look first
      // and fail here, where the app can say so. If that lookup itself fails, let the redirect try.
      const cfg = await projectSettings()
      if (cfg && cfg.external[provider] === false) throw Object.assign(new Error(`${provider} sign-in is not enabled`), { code: 'provider_off' })
      localStorage.setItem(SIGNING_IN, '1')
      const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: location.origin + location.pathname } })
      if (error) { localStorage.removeItem(SIGNING_IN); fail(error) }
    },
    // What this project lets people do right now, narrowed from what the build lists: a password
    // account only works while sign-ups are signed in at once (a username has no inbox to confirm
    // from), and a provider only once it has been switched on in the dashboard.
    available: async () => {
      const cfg = await projectSettings()
      return {
        password: PASSWORD && (!cfg || (cfg.external.email !== false && cfg.autoconfirm)),
        oauth: OAUTH.filter(p => !cfg || cfg.external[p] !== false)
      }
    },
    // Username + password: the username stands in for an email that is never mailed (lib/username.js).
    signUpWithPassword: async (username, password, name) => {
      const { data, error } = await sb.auth.signUp({ email: toEmail(username), password, options: { data: { name: name || username, username } } })
      if (error) fail(error)
      // no session back means the project is waiting on a confirmation email nobody can receive
      if (!data.session) throw Object.assign(new Error('sign-up needs confirming'), { code: 'confirm_required' })
      return asUser(data.user)
    },
    signInWithPassword: async (username, password) => {
      const { data, error } = await sb.auth.signInWithPassword({ email: toEmail(username), password })
      if (error) fail(error)
      return asUser(data.user)
    },
    verifyCode: async (email, token) => {
      const { data, error } = await sb.auth.verifyOtp({ email, token, type: 'email' })
      if (error) fail(error)
      return asUser(data.user)
    },
    getState: async () => {
      await session()
      const { data, error } = await sb.from('user_state').select('state').maybeSingle()
      if (error) fail(error)
      return data ? data.state : null
    },
    putState: async state => {
      const { user } = await session()
      const { error } = await sb.from('user_state').upsert({ user_id: user.id, state: stripActive(state), ts: state._ts || 0 })
      if (error) fail(error)
    },
    signOut: async () => { await sb.auth.signOut({ scope: 'local' }) },
    // 'global' revokes every session this account has, on every device — the same meaning as api/'s /logout/all
    signOutAll: async () => {
      const { error } = await sb.auth.signOut({ scope: 'global' })
      if (error) fail(error)
    },
  }
}

export const backend = SUPABASE ? supabase() : legacy
