// Every tunable number behind the training engine ("Peek Training Engine: Evidence
// Blueprint", 2026-10-16), in one place so changing a weight never means touching logic.
// Plain constants rather than synced state on purpose: these are judgement calls about the
// research, not per-person settings, and a one-line edit here is the whole change.

/* ---------------- layer 1: exercise score ---------------- */

// Muscle score (H) = L × (0.55 S + 0.25 St + 0.20 P), spec v2. Stretch carries the most weight
// (the only rating with direct studies behind it), then stability and progression. The limiter L
// is a gate, not a term: an exercise where the target muscle is not what gives out first can't
// make that muscle grow however good its stretch is, so L scales everything else (L 5 halves H).
export const H_WEIGHTS = { S: 0.55, St: 0.25, P: 0.20 }
// Strength score (Str): mostly 'can you go heavy on a lift worth being strong at'.
export const STR_WEIGHTS = { T: 0.45, St: 0.25, P: 0.20, L: 0.10 }
// H_eff = H × (1 − COST_PENALTY × C): C 1 keeps 96 %, C 10 keeps 60 %. Peek's estimate of
// stimulus-to-fatigue — an estimate, since nobody can measure that ratio directly.
export const COST_PENALTY = 0.04
// The goal is mostly muscle with some strength.
export const GOAL_SPLIT = { hyp: 0.75, str: 0.25 }

// An exercise that hurts you is a bad exercise for you, whatever the studies say.
export const COMFORT_MIN = 5
export const COMFORT_FACTOR = 0.8

/* ---------------- layer 2: effective sets ---------------- */

// How much one set counts toward a muscle's week, by reps left in the tank. Sets within a
// couple of reps of failure count in full; past that the credit falls off fast, because a set
// stopped five short barely differs from a warm-up. Index = whole RIR, the last entry is 5+.
export const RIR_CREDIT = [1.0, 1.0, 0.9, 0.75, 0.5, 0.25]
// A set nobody rated counts in full. Rating is optional, and years of history were logged
// before it existed — guessing those sets were easy would quietly shrink every old week.
export const UNRATED_CREDIT = 1.0
// Past this many reps a set is more endurance than growth stimulus, so it counts half.
export const REPS_VALID_MAX = 30
export const HIGH_REP_CREDIT = 0.5

// Effective sets per muscle per week: below the first line is too little to grow on, then OK,
// then the productive band, and past the last line extra sets mostly add tiredness.
export const WEEKLY_ZONES = [6, 10, 20]
// The goal Peek holds you to: effective sets per big muscle, Monday to Sunday. It is the bottom of
// the productive zone, so it is what's worth aiming for rather than a ceiling.
export const WEEK_GOAL = WEEKLY_ZONES[1]
// Per muscle, because one number for all ten was too easy for some and too hard for others: a
// supporting muscle already earns half credit from the big lifts (muscles.js SECONDARY), so the
// muscles those lifts feed need fewer sets of their own. Nothing goes under the first zone line
// (6) — below it Stats calls a muscle "under", and Home saying "goal hit" there would contradict
// it. The 10 vs 8 vs 6 split is judgement on top of the zones, not a measured result.
// `why` is what Peek says when it holds you to the number, so it must stay true to that reasoning.
export const MUSCLE_GOALS = {
  chest:       { sets: 10, why: 'A big muscle you mostly train head-on, so it gets the full amount.' },
  'upper-back': { sets: 10, why: 'A big muscle you mostly train head-on, so it gets the full amount.' },
  quadriceps:  { sets: 10, why: 'A big muscle you mostly train head-on, so it gets the full amount.' },
  hamstring:   { sets: 8, why: 'Squats and hinges already count half toward it, so it needs a little less.' },
  gluteal:     { sets: 8, why: 'Squats and hinges already count half toward it, so it needs a little less.' },
  deltoids:    { sets: 8, why: 'Presses already count half toward it, so it needs a little less.' },
  biceps:      { sets: 8, why: 'Rows and pulldowns already count half toward it, so it needs a little less.' },
  triceps:     { sets: 8, why: 'Presses already count half toward it, so it needs a little less.' },
  calves:      { sets: 8, why: 'Small and quick to recover, but little else trains it.' },
  abs:         { sets: 6, why: 'Squats, deadlifts and carries already work it, so the bottom of the OK band is enough.' }
}
// A muscle missing from the table falls back to the flat goal rather than to no goal.
export const goalFor = m => (MUSCLE_GOALS[m] || { sets: WEEK_GOAL }).sets
export const goalWhy = m => (MUSCLE_GOALS[m] || {}).why || null
// Until this few days of the week are left (Sunday = 0, Monday = 6), a muscle that is behind is
// just one you haven't trained yet, and Peek stays quiet. After that it says where the week stands.
export const NUDGE_DAYS_LEFT = 3
// Effective sets for one muscle in one session before more stop paying off — past this the
// workout suggests moving the rest to another day.
export const SESSION_CAP = 11
// A heavy set, for strength: this many reps or fewer.
export const HEAVY_REPS = 8
// Times a week a main lift should be trained to keep the strength side moving.
export const MAIN_LIFT_FREQ = 2
// A rated lift counts as a main lift from this strength-transfer rating up.
export const MAIN_LIFT_T = 7
