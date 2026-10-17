// Every tunable number behind the training engine ("Peek Training Engine: Evidence
// Blueprint", 2026-10-16), in one place so changing a weight never means touching logic.
// Plain constants rather than synced state on purpose: these are judgement calls about the
// research, not per-person settings, and a one-line edit here is the whole change.

/* ---------------- layer 1: exercise score ---------------- */

// The six ratings, 0–10 each, in the order every screen lists them. C is the odd one out:
// it measures whole-body tiredness, so higher is worse.
export const RATINGS = ['S', 'L', 'St', 'P', 'T', 'C']
export const LOWER_IS_BETTER = new Set(['C'])

// Muscle score (H): mostly "is it hard at the stretch" and "does the target muscle give out
// first", then stability and how well it progresses. Ordered by how solid the evidence is —
// the stretch findings are the only ones with direct studies behind them.
export const H_WEIGHTS = { S: 0.35, L: 0.30, St: 0.20, P: 0.15 }
// Strength score (Str): mostly "can you go heavy on a lift worth being strong at".
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
// Effective sets for one muscle in one session before more stop paying off — past this the
// workout suggests moving the rest to another day.
export const SESSION_CAP = 11
// A heavy set, for strength: this many reps or fewer.
export const HEAVY_REPS = 8
// Times a week a main lift should be trained to keep the strength side moving.
export const MAIN_LIFT_FREQ = 2
// A rated lift counts as a main lift from this strength-transfer rating up.
export const MAIN_LIFT_T = 7
