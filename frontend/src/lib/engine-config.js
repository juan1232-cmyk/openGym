// Every tunable number behind the training engine ("Peek Training Engine: Evidence
// Blueprint", 2026-10-16), in one place so changing a weight never means touching logic.
// Plain constants rather than synced state on purpose: these are judgement calls about the
// research, not per-person settings, and a one-line edit here is the whole change.

/* ---------------- layer 1: exercise score ---------------- */

// The six ratings, 0–10 each, in the order every screen lists them. C is the odd one out:
// it measures whole-body tiredness, so higher is worse.
export const RATINGS = ['S', 'L', 'St', 'P', 'T', 'C']
export const LOWER_IS_BETTER = new Set(['C'])

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

// Comparing two exercises (score.js compare): scores closer than this are "about the same" —
// the ratings are judgement calls, and eight points is well inside their noise.
export const SAME_WITHIN = 8
// Where a study measured the difference directly, the study decides, not the formula. Each pair
// is [better, worse]; the tags are the `studied` field of a rating. The two ends of a pair are
// two ways of doing the same lift (arms overhead vs at the side, hips bent vs straight, seat
// reclined vs upright), which is the comparison those studies made.
export const STUDIED_PAIRS = [
  ['overhead_triceps_ext', 'triceps_pushdown'],
  ['seated_leg_curl', 'lying_leg_curl'],
  ['standing_calf_raise', 'seated_calf_raise'],
  ['leg_ext_reclined', 'leg_ext_upright']
]
// On the compare sheet's scoreboard, a rating whose difference is worth fewer score points than
// this is marked "small": winning two small rows must not read as beating one decisive one.
export const SMALL_IMPACT = 3
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
