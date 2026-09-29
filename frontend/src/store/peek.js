import { useMemo } from 'react'
import { useStore } from './useStore.js'
import { peekOf, noteSaid, stageOf } from '../lib/peek/memory.js'
import { pickLine } from '../lib/peek/lines.js'

// Peek's memory lives in the synced state blob (S.peek), so it goes through update() like
// everything else and follows the profile across devices.
export const usePeek = () => {
  const raw = useStore(s => s.S.peek)
  return useMemo(() => peekOf({ peek: raw }), [raw])
}
export const getPeek = () => peekOf(useStore.getState().S)
export const updatePeek = fn => useStore.getState().update(s => { s.peek = fn(peekOf(s)) })
// a line was said out loud — remember it so the next pick avoids it
export const said = line => { if (line && line.key) updatePeek(p => noteSaid(p, line.key)) }

// what the line picker needs from memory: bond stage, honesty, what was said lately
export const peekOpts = (p = getPeek()) => ({ stage: stageOf(p.bond), honesty: p.honesty, said: p.said })
// Pick a line for a situation and remember it was said. null when Peek's voice is off in
// Settings (its face still reacts) or nothing fits this bond stage.
export function sayNow(situation, args = [], rng = Math.random) {
  const p = getPeek()
  if (!p.voice) return null
  const l = pickLine(situation, args, rng, peekOpts(p))
  said(l)
  return l ? l.text : null
}
