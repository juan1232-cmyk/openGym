// How a device and the server settle which copy of the profile wins. Pure, and kept out of the
// store, because getting it wrong loses someone's training log and clicking through the UI never
// exercises the offline / two-device cases (see CONTRIBUTING.md on why logic lives in lib/).

// Does this profile hold anything worth protecting from being overwritten?
export const hasData = st => !!((st.workouts || []).length || (st.routines || []).length || (st.bodyweight || []).length)

// What to do on a pull, given the server's copy (null = none yet), this device's copy, and
// whether an edit here never reached the server (`gym_dirty`).
//   'adopt' — take the server's copy
//   'push'  — this device is the one with something to keep; send it up
//   'keep'  — nothing to do
// The server wins only when this device has nothing of its own, or the server's copy is at
// least as new AND no offline edit is waiting. A dirty device always keeps its own edits, even
// when the server's timestamp is newer, so an offline workout is never silently overwritten.
export function syncAction(remote, local, dirty) {
  if (remote && (!hasData(local) || ((remote._ts || 0) >= (local._ts || 0) && !dirty))) return 'adopt'
  if (hasData(local)) return 'push'
  return 'keep'
}

// What to do right after the person signs in, which is not a background pull: timestamps are
// no help, because a device that was only used as a guest can easily look "newer" than the
// account it is signing in to, and "newest wins" would then wipe the account's history.
//   'adopt'  — the account has data (or just settings) and this device has none of its own
//   'push'   — this device has data and the account has none: it's their first account
//   'choose' — both have real data; the person must say which to keep, nothing is overwritten
//   'keep'   — nothing on either side
export function signInAction(remote, local) {
  const here = hasData(local), there = !!remote && hasData(remote)
  if (here && there) return 'choose'
  if (here) return 'push'
  return remote ? 'adopt' : 'keep'
}
