// Every tunable number behind the training engine ("Peek Training Engine: Evidence
// Blueprint", 2026-10-16), in one place so changing a weight never means touching logic.
// Plain constants rather than synced state on purpose: these are judgement calls about the
// research, not per-person settings, and a one-line edit here is the whole change.

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
