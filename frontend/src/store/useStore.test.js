// boot() when the page has just come back from a provider's sign-in. The redirect leaves no form
// on screen to hold the "which copy do I keep?" question, so boot() has to settle it itself — and
// getting it wrong loses someone's training log (see lib/sync.js). Everything the store touches in
// the browser is stubbed; the backend is a fake whose answers each test sets.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const be = vi.hoisted(() => ({ me: vi.fn(), getState: vi.fn(), putState: vi.fn(async () => {}), signOut: vi.fn() }))
vi.mock('../lib/backend.js', () => ({ backend: be, SIGNING_IN: 'gym_signing_in' }))

const mem = {}
vi.stubGlobal('localStorage', {
  getItem: k => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v) },
  removeItem: k => { delete mem[k] }
})
vi.stubGlobal('document', { addEventListener() {}, visibilityState: 'visible' })

const KEY = 'gym_state_v1'
const logged = { workouts: [{ id: 'w1' }], routines: [], bodyweight: [] }
const user = { id: 'u1', name: 'Sam', admin: false }

// the store keeps one boot() promise per module instance, so every test gets a fresh one
async function boot({ device, account, signingIn = true, session = true }) {
  for (const k of Object.keys(mem)) delete mem[k]
  if (device) mem[KEY] = JSON.stringify({ ...device, _ts: 5 })
  if (signingIn) mem.gym_signing_in = '1'
  be.me.mockReset(); be.getState.mockReset(); be.putState.mockClear(); be.signOut.mockReset()
  if (session) be.me.mockResolvedValue(user)
  else be.me.mockRejectedValue(Object.assign(new Error('not signed in'), { status: 401 }))
  be.getState.mockResolvedValue(account ?? null)
  vi.resetModules()
  const { useStore } = await import('./useStore.js')
  await useStore.getState().boot()
  return useStore
}

describe('boot() after a provider sign-in', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('takes the account copy when this device has nothing of its own', async () => {
    const store = await boot({ account: { ...logged, _ts: 1 } })
    expect(store.getState().user).toEqual(user)
    expect(store.getState().S.workouts).toHaveLength(1)
    expect(be.putState).not.toHaveBeenCalled()
    expect(store.getState().signInResult).toEqual({ name: 'Sam' })
  })

  it('uploads this device’s data when the account is new', async () => {
    const store = await boot({ device: logged, account: null })
    expect(be.putState).toHaveBeenCalledTimes(1)
    expect(store.getState().user).toEqual(user)
  })

  it('creates the account row even when the device only holds onboarding answers', async () => {
    const store = await boot({ device: { goal: 'muscle', name: 'Sam' }, account: null })
    expect(be.putState).toHaveBeenCalledTimes(1)
    expect(store.getState().S.goal).toBe('muscle')
  })

  it('asks before touching anything when both sides hold data, even if this device looks newer', async () => {
    const store = await boot({ device: { ...logged, workouts: [{ id: 'mine' }] }, account: { ...logged, _ts: 1 } })
    expect(store.getState().pendingChoice).toEqual({ user, remote: { ...logged, _ts: 1 } })
    expect(store.getState().user).toBeNull()
    expect(store.getState().S.workouts).toEqual([{ id: 'mine' }])
    expect(be.putState).not.toHaveBeenCalled()
  })

  it('says so when the provider sent nobody back', async () => {
    const store = await boot({ session: false })
    expect(store.getState().user).toBeNull()
    expect(store.getState().signInResult).toEqual({ failed: true })
    expect(store.getState().ready).toBe(true)
  })

  it('treats the flag as one-shot', async () => {
    await boot({ account: { ...logged, _ts: 1 } })
    expect(mem.gym_signing_in).toBeUndefined()
  })
})

describe('boot() on an ordinary load', () => {
  it('pulls instead of settling, and says nothing', async () => {
    const store = await boot({ signingIn: false, account: { ...logged, _ts: 9 } })
    expect(store.getState().user).toEqual(user)
    expect(store.getState().signInResult).toBeNull()
    expect(store.getState().pendingChoice).toBeNull()
  })

  it('runs once even when it is called twice (StrictMode)', async () => {
    const store = await boot({ signingIn: false })
    await store.getState().boot()
    expect(be.me).toHaveBeenCalledTimes(1)
  })
})
