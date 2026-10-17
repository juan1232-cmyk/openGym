// Starting ratings for the exercise score (layer 1 of the training engine), so comparing
// works from day one. Data only — the formulas are in score.js, the weights in
// engine-config.js.
//
// S stretch · L the target muscle is what gives out · St stability · P easy to progress ·
// T strength transfer · C whole-body cost (higher is worse). All 0–10.
//
// Only the stretch ratings for triceps, hamstrings, calves and the reclined leg extension
// follow direct studies; every other number is a first guess meant to be adjusted. `EVIDENCE`
// says how far to trust each kind of rating, and the app shows it next to the number.
export const EVIDENCE = { S: 'B', L: 'C', St: 'B', P: 'C', T: 'A', C: 'C' }
export const EVIDENCE_NAME = {
  A: 'Strong studies',
  B: 'Some direct studies',
  C: 'Reasoning, no direct study yet'
}

// `muscle` is a muscles.js slug, so alternatives are found the same way the body map counts
// them. Lats and upper back are one slug there, which is why the pulldown and the row share it.
// Where the dataset holds several versions of a movement, the id is the one a typical gym
// has and the doc's ratings describe:
//  · preacher curl → the lever (machine) version, matching "machine/EZ"
//  · cable fly → standing fly, the plain crossover setup
//  · chest-supported row → dumbbell incline row: lying chest-down on an incline bench
//  · calf raises → the lever machines (also what the starter plan uses)
//  · leg extension → the dataset has no reclined variant; "reclined" is how you set the seat
const R = (id, muscle, S, L, St, P, T, C) => ({ id, muscle, S, L, St, P, T, C })
export const RATED = [
  R('0592', 'biceps', 7, 9, 9, 7, 2, 1),       // lever preacher curl
  R('0318', 'biceps', 8, 8, 7, 6, 2, 1),       // dumbbell incline curl
  R('0605', 'calves', 9, 8, 8, 8, 1, 2),       // lever standing calf raise
  R('0594', 'calves', 3, 8, 9, 8, 1, 1),       // lever seated calf raise
  R('0227', 'chest', 8, 8, 8, 7, 2, 2),        // cable standing fly
  R('0577', 'chest', 6, 8, 9, 8, 5, 4),        // lever chest press
  R('0025', 'chest', 6, 7, 6, 9, 10, 6),       // barbell bench press
  R('0599', 'hamstring', 9, 9, 10, 8, 2, 2),   // lever seated leg curl
  R('0586', 'hamstring', 6, 9, 9, 8, 2, 2),    // lever lying leg curl
  R('0085', 'hamstring', 8, 6, 5, 7, 7, 8),    // barbell romanian deadlift
  R('2330', 'upper-back', 8, 7, 9, 8, 5, 3),   // cable lat pulldown
  R('0585', 'quadriceps', 7, 10, 10, 8, 2, 2), // lever leg extension, seat reclined
  R('0743', 'quadriceps', 8, 8, 9, 8, 6, 6),   // sled hack squat
  R('0043', 'quadriceps', 7, 6, 5, 8, 10, 9),  // barbell full squat
  R('0178', 'deltoids', 6, 8, 8, 6, 1, 1),     // cable lateral raise
  R('0334', 'deltoids', 2, 8, 7, 5, 1, 1),     // dumbbell lateral raise
  R('0194', 'triceps', 9, 9, 8, 8, 2, 2),      // cable overhead triceps extension
  R('0201', 'triceps', 4, 9, 9, 8, 2, 1),      // cable pushdown
  R('0327', 'upper-back', 6, 8, 9, 8, 5, 3),   // dumbbell incline row (chest-supported)
]
export const RATING_OF = Object.fromEntries(RATED.map(r => [r.id, r]))
