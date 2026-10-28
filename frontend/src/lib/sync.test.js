import { describe, it, expect } from 'vitest'
import { hasData, syncAction, signInAction } from './sync.js'

const empty = (ts = 0) => ({ workouts: [], routines: [], bodyweight: [], _ts: ts })
const full = (ts = 0) => ({ workouts: [{ id: 1 }], routines: [], bodyweight: [], _ts: ts })

describe('hasData', () => {
  it('counts workouts, routines or body weight, and nothing else', () => {
    expect(hasData(empty())).toBe(false)
    expect(hasData({})).toBe(false)
    expect(hasData({ routines: [{}] })).toBe(true)
    expect(hasData({ bodyweight: [{}] })).toBe(true)
    // settings alone are not data worth defending
    expect(hasData({ unit: 'lb', goal: 'strength' })).toBe(false)
  })
})

describe('syncAction', () => {
  it('adopts the server copy on a fresh device', () => {
    expect(syncAction(full(5), empty(99), false)).toBe('adopt')
  })

  it('adopts a newer or equal server copy when nothing is waiting to upload', () => {
    expect(syncAction(full(10), full(5), false)).toBe('adopt')
    expect(syncAction(full(5), full(5), false)).toBe('adopt')
  })

  it('keeps and pushes this device when it is the newer one', () => {
    expect(syncAction(full(5), full(10), false)).toBe('push')
  })

  it('never lets a newer server copy overwrite an offline edit', () => {
    expect(syncAction(full(10), full(5), true)).toBe('push')
  })

  it('still adopts when dirty but this device has nothing of its own', () => {
    expect(syncAction(full(10), empty(5), true)).toBe('adopt')
  })

  it('uploads a guest profile the first time an account has no copy', () => {
    expect(syncAction(null, full(5), false)).toBe('push')
  })

  it('does nothing when neither side has anything', () => {
    expect(syncAction(null, empty(), false)).toBe('keep')
    expect(syncAction(empty(), empty(), false)).toBe('adopt')
  })

  it('treats a server copy with no timestamp as the oldest', () => {
    expect(syncAction({ workouts: [{}] }, full(1), false)).toBe('push')
  })
})

describe('signInAction', () => {
  it('never overwrites either side when both hold real data, however the timestamps fall', () => {
    expect(signInAction(full(1), full(99))).toBe('choose')
    expect(signInAction(full(99), full(1))).toBe('choose')
  })

  it('moves a guest profile into a brand-new account', () => {
    expect(signInAction(null, full(5))).toBe('push')
    expect(signInAction(empty(), full(5))).toBe('push')
  })

  it('restores the account on a device with nothing of its own, settings-only included', () => {
    expect(signInAction(full(5), empty(99))).toBe('adopt')
    expect(signInAction({ unit: 'lb', _ts: 5 }, { unit: 'kg', _ts: 99 })).toBe('adopt')
  })

  it('does nothing for a brand-new account on an empty device', () => {
    expect(signInAction(null, empty())).toBe('keep')
  })
})
