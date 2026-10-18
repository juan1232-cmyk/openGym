// Port of the scoring code in section 6 of the Peek exercise scoring spec (v2). Kept
// line-for-line with the Python so the numbers match the spec's check (overhead cable
// triceps extension → score 67, H_eff 71, Str 54).

// Python's round() is round-half-to-even; Math.round is not. Matters only on exact .5.
export function pyRound(x) {
  const f = Math.floor(x), d = x - f
  if (d < 0.5) return f
  if (d > 0.5) return f + 1
  return f % 2 === 0 ? f : f + 1
}

export function score(S, L, St, P, T, C, J = 10) {
  const H = (L / 10) * 10 * (0.55 * S + 0.25 * St + 0.20 * P)   // muscle score, limiter is a gate
  const H_eff = H * (1 - 0.04 * C)                               // tiredness penalty
  const Str = 10 * (0.45 * T + 0.25 * St + 0.20 * P + 0.10 * L)  // strength score
  let final = 0.75 * H_eff + 0.25 * Str
  if (J < 5) final *= 0.8                                        // joint comfort penalty
  return { H: pyRound(H), H_eff: pyRound(H_eff), Str: pyRound(Str), score: pyRound(final) }
}

export function scoreExercise(ex) {
  const out = {}
  for (const t of ex.targets) out[t.muscle] = score(t.S, t.L, ex.St, ex.P, ex.T, ex.C, ex.J ?? 10)
  return out
}
