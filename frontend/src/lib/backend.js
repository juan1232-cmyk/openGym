// The one place the app talks to an account/sync server. Two interchangeable backends:
//   - Supabase, when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set at build time (the hosted
//     app): email-code sign-in, and the whole profile as one row in `user_state`.
//   - the self-hosted server in api/ (passkeys, JSON files), otherwise.
// The store only ever calls the methods below, so it doesn't know which one it has. Both throw an
// Error with `.status` (401 = not signed in), which is what the store's boot() already expects.
import { createClient } from '@supabase/supabase-js'
import { api } from './api.js'

const URL = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
export const SUPABASE = !!(URL && KEY)

// 'code' = emailed 6-digit code (Supabase has no passkeys); 'passkey' = WebAuthn against api/
export const AUTH = SUPABASE ? 'code' : 'passkey'

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
const fail = e => { throw Object.assign(new Error(e.message), { status: e.status }) }
const asUser = u => ({ id: u.id, name: u.user_metadata?.name || u.email?.split('@')[0] || '', admin: false })

function supabase() {
  // The anon key is public by design: it only identifies the project. What protects the data is
  // row-level security on `user_state` (supabase/migrations), never this key.
  const sb = createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })
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
