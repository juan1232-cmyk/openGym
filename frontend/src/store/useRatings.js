// Re-renders a screen when the ratings table arrives (lib/ratings.js loads it on demand), and
// starts the load if nothing has. Call it in any component that shows a score or reads
// isMainLift; the return value is only there to be a dependency.
import { useEffect, useSyncExternalStore } from 'react'
import { loadRatings, onRatings, ratingsReady } from '../lib/ratings.js'

export function useRatings() {
  useEffect(() => { loadRatings() }, [])
  return useSyncExternalStore(onRatings, ratingsReady)
}
