// Built-in programs: plan bundles (the same shape plan-share.js exports) that ship with the
// app, so a whole program loads through the normal import sheet — new routines, the week
// optional, nothing existing touched. Every id is checked against the dataset in
// programs.test.js; a typo here would otherwise only show up as a silently dropped exercise.

// One reps exercise. Loaded lifts run double progression from `lo` up to `hi` (repsMin → reps);
// bodyweight ones climb reps up to the repsMax ceiling instead (progression.js). Unilateral
// work logs the total across both sides, so a per-side range is doubled here.
function ex(id, sets, lo, hi, o = {}) {
  const k = o.side ? 2 : 1
  const range = o.bw ? { reps: lo * k, repsMax: hi * k } : { reps: hi * k, repsMin: lo * k }
  const e = { id, sets, ...range }
  // Spelled out even where the catalogue agrees: a custom exercise has no equipment to infer it from.
  if (o.bw) e.bodyweight = true
  if (o.side) e.side = true
  if (o.rir != null) e.rir = o.rir
  if (o.sg) e.sg = o.sg
  return e
}
const hold = (id, sets, sec, o = {}) => ({ id, sets, mode: 'time', sec, prog: o.prog || 'time', ...(o.sg ? { sg: o.sg } : {}) })
const cardio = (id, min, speed) => ({ id, sets: 1, min, speed })

const UPPER_A = 'vt-upper-a', LEGS_R1 = 'vt-legs-r1', UPPER_B = 'vt-upper-b', LEGS_R2 = 'vt-legs-r2', PUMP = 'vt-pump'

// V-taper upper body (lats, side delts, forearms three times a week), cables for the stretch,
// and a knee-rebuild leg phase after a patellar dislocation: no squats, lunges or leg press
// until the knee passes the tests in the note. The Phase 2 leg days come along unscheduled,
// to swap onto Tue/Fri once it does.
const VTAPER_KNEE = {
  opengym_plan: 1,
  name: 'V-Taper & Knee Rebuild',
  note: [
    'Cables and isolation: 3 s down, pause in the stretch, 1 s squeeze. Last set to failure, then 5–8 half-reps in the stretch.',
    'Weeks 1–2: leave the last set of each exercise unticked, then do them all.',
    'Knee: it tracks over your 2nd–3rd toe, never twists or caves in. Pain up to 3/10 that settles overnight is fine; a shifting kneecap or next-day swelling is not.',
    'Phase 2 legs (in your library, not scheduled) once: no swelling for 2 weeks, the injured leg does 80% of the other on single-leg extensions, and 3 × 15 box squats and 10 slow step-downs are pain-free.'
  ].join('\n'),
  week: { 1: UPPER_A, 2: LEGS_R1, 4: UPPER_B, 5: LEGS_R2, 6: PUMP },
  customEx: [
    { id: 'vt-tib', n: 'Tibialis raise', bp: 'lower legs', desc: 'Back against a wall, heels about a foot out. Pull your toes up as high as they go, lower slowly.' },
    { id: 'vt-hang', n: 'Dead hang', bp: 'lower arms', desc: 'Hang from a pull-up bar, shoulders active, as long as your grip holds.' },
    { id: 'vt-spanish', n: 'Spanish squat hold', bp: 'upper legs', desc: 'Heavy band anchored behind both knees, shins vertical, sit back to a pain-free depth and hold.' },
    { id: 'vt-backwalk', n: 'Backward incline walk', bp: 'cardio', desc: 'Treadmill on a slight incline, walking backwards at an easy pace, holding the rails.' }
  ],
  routines: [
    { id: UPPER_A, name: 'Upper A · Strength + Lats', emoji: 'pullup', prog: 'double', ex: [
      ex('0025', 3, 4, 6, { rir: 1 }),                 // barbell bench press
      ex('0652', 4, 5, 8, { bw: true }),               // pull-up
      ex('0426', 3, 6, 10, { rir: 1 }),                // standing dumbbell overhead press
      ex('3563', 3, 10, 12, { side: true }),           // single-arm cable pulldown
      ex('0192', 4, 12, 15, { side: true }),           // single-arm cable lateral raise
      ex('0194', 3, 10, 12, { sg: 'vt-a1' }),          // overhead rope triceps extension
      ex('0190', 3, 10, 12, { side: true, sg: 'vt-a1' }), // bayesian (one-arm) cable curl
      ex('0247', 3, 12, 20, { sg: 'vt-a2' }),          // cable wrist curl
      ex('0210', 3, 12, 20, { sg: 'vt-a2' })           // cable reverse wrist curl
    ] },
    { id: LEGS_R1, name: 'Legs R1 · Quads & Glutes', emoji: 'legs', prog: 'double', ex: [
      cardio('2138', 10, 18),                          // stationary bike
      ex('0585', 4, 12, 20),                           // leg extension
      ex('1409', 4, 8, 12),                            // barbell glute bridge
      ex('0599', 3, 10, 15),                           // seated leg curl
      ex('0597', 3, 15, 20, { sg: 'vt-r1' }),          // hip abduction machine
      ex('0598', 3, 15, 20, { sg: 'vt-r1' }),          // hip adduction machine
      ex('0605', 3, 10, 15),                           // standing calf raise
      ex('vt-tib', 2, 15, 25, { bw: true })            // tibialis raise
    ] },
    { id: UPPER_B, name: 'Upper B · Cable Size', emoji: 'machine', prog: 'double', ex: [
      ex('0314', 4, 8, 12, { rir: 1 }),                // incline dumbbell press
      ex('2330', 3, 8, 12),                            // lat pulldown
      ex('0861', 3, 10, 12),                           // seated cable row
      ex('0179', 3, 12, 15),                           // low-to-high cable fly
      ex('0237', 3, 12, 15),                           // straight-arm rope pulldown
      ex('0178', 3, 12, 20, { sg: 'vt-b1' }),          // cable lateral raise
      ex('0225', 3, 12, 20, { sg: 'vt-b1' }),          // cable reverse fly (crossover)
      ex('0200', 3, 10, 15, { sg: 'vt-b2' }),          // rope pushdown
      ex('0165', 3, 10, 15, { sg: 'vt-b2' }),          // rope hammer curl
      ex('0206', 3, 12, 15)                            // cable reverse curl
    ] },
    { id: LEGS_R2, name: 'Legs R2 · Hinge & Hamstrings', emoji: 'legs', prog: 'double', ex: [
      cardio('2138', 10, 18),                          // stationary bike
      ex('1459', 3, 8, 12),                            // dumbbell romanian deadlift
      ex('0196', 3, 12, 15),                           // cable pull-through
      ex('0489', 3, 10, 15, { bw: true }),             // 45° back extension
      ex('0599', 3, 10, 15),                           // seated leg curl
      ex('0228', 2, 12, 15, { side: true }),           // cable glute kickback
      ex('0594', 3, 12, 20),                           // seated calf raise
      cardio('vt-backwalk', 5, 3)                      // backward incline walk
    ] },
    { id: PUMP, name: 'V-Taper Pump', emoji: 'arm', prog: 'double', ex: [
      ex('1326', 3, 6, 12, { bw: true }),              // chin-up
      ex('0189', 3, 10, 12, { side: true }),           // single-arm cable row
      ex('0192', 4, 15, 20, { side: true }),           // single-arm cable lateral raise
      ex('0203', 3, 12, 15),                           // rope face pull
      ex('1636', 3, 12, 15, { sg: 'vt-p1' }),          // overhead cable curl
      ex('0860', 3, 12, 15, { sg: 'vt-p1' }),          // cable triceps kickback
      ex('0224', 3, 15, 20, { sg: 'vt-p2' }),          // behind-the-back cable wrist curl
      ex('0385', 3, 15, 20, { sg: 'vt-p2' }),          // dumbbell reverse wrist curl
      hold('vt-hang', 3, 30),                          // dead hang
      ex('0472', 3, 8, 15, { bw: true })               // hanging leg raise
    ] },
    { id: 'vt-p2-heavy', name: 'Phase 2 · Legs A Heavy', emoji: 'barbell', prog: 'double', ex: [
      ex('1436', 4, 4, 6, { rir: 1 }),                 // high-bar back squat
      ex('0085', 3, 6, 10, { rir: 1 }),                // barbell romanian deadlift
      ex('0739', 3, 10, 15),                           // 45° leg press
      ex('0585', 3, 10, 15),                           // leg extension
      ex('0599', 4, 8, 12),                            // seated leg curl
      ex('0605', 4, 8, 12)                             // standing calf raise
    ] },
    { id: 'vt-p2-knee', name: 'Phase 2 · Legs B Knee-Proof', emoji: 'stretch', prog: 'double', ex: [
      hold('1604', 2, 60, { prog: 'off' }),            // world's greatest stretch
      hold('vt-spanish', 3, 45),                       // spanish squat hold
      ex('0811', 3, 5, 8, { rir: 2 }),                 // trap-bar deadlift
      ex('0410', 3, 8, 12, { side: true }),            // bulgarian split squat
      ex('0431', 3, 8, 10, { side: true }),            // dumbbell step-up
      ex('1757', 2, 8, 10, { side: true }),            // single-leg dumbbell deadlift
      ex('0597', 3, 12, 20, { sg: 'vt-k1' }),          // hip abduction machine
      hold('1775', 3, 30, { sg: 'vt-k1' }),            // side-plank adduction
      ex('0594', 3, 12, 15, { sg: 'vt-k2' }),          // seated calf raise
      ex('vt-tib', 2, 15, 25, { bw: true, sg: 'vt-k2' }), // tibialis raise
      cardio('vt-backwalk', 5, 3)                      // backward incline walk
    ] }
  ]
}

export const PROGRAMS = [VTAPER_KNEE]
