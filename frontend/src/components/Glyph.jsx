// Routine glyphs — the picture on a routine ("Push Day", "Leg Day", "Kettlebell").
//
// Every glyph is Peek. The app's one distinctive shape is the orb: a solid sphere with two
// slanted pill eyes. So each routine picture is that sphere — or an object made of it — doing
// the thing the routine is: lifting the bar, hanging from it, asleep for a rest day, a
// kettlebell with a face. The two eyes are what tie the set to the rest of the app; without
// them it would be a different icon pack.
//
//   · .f   solid ink                      · .t   the same ink at 40%
//   · .e   knockout — filled with the tile colour (--glyph-eye), so the eyes read as holes
//   · .sep a solid shape that gets a knockout outline, to sit in front of another
//   · .s1…s4 round-capped strokes (2 / 2.6 / 3.4 / 4.4) for limbs and bars
// Ink is currentColor; the knockout is --glyph-eye, set by whatever tile the glyph sits on
// (index.css) so the eyes stay holes on the green tile, a grey picker cell or a selected one.
//
// The keys are the ones glyphs.js stores in `routine.emoji` — they must not be renamed. A key
// with no drawing here (a legacy 'trophy', 'star'…) falls through to the outline Icon.

import Icon from './Icon.jsx'

// Peek's eyes, centred on (x, y). k scales them, r tilts them (the app icon's are ~-28°; the
// orb in the app sits nearer -14°). `calm` lays them flat for rest, sleep and stretching.
const Eyes = ({ x, y, k = 1, r = -14, calm }) => (
  <g className="e" transform={`translate(${x} ${y}) rotate(${calm ? 0 : r}) scale(${k})`}>
    {calm
      ? <><rect x="-4.6" y="-1" width="3.8" height="2" rx="1" /><rect x="0.8" y="-1" width="3.8" height="2" rx="1" /></>
      : <><rect x="-3.2" y="-2.3" width="2" height="4.6" rx="1" /><rect x="1.2" y="-2.3" width="2" height="4.6" rx="1" /></>}
  </g>
)

// Peek's head over a torso, shared by the muscle-group glyphs below.
const Head = ({ away, k = 1 }) => <>
  <circle className="f" cx="12" cy={4.2} r={3 * k} />
  {!away && <Eyes x={12} y={4.3} k={0.46 * k} />}
</>
const Bust = () => <path className="t" d="M6.2 8.4h11.6a3.4 3.4 0 0 1 3.4 3.4l-.6 3.2c-.4 2-1.6 4-2.8 6H6.2c-1.2-2-2.4-4-2.8-6l-.6-3.2a3.4 3.4 0 0 1 3.4-3.4Z" />

const WAVE ='M0 14.6c1.6-1.5 3.2-1.5 4.8 0s3.2 1.5 4.8 0 3.2-1.5 4.8 0 3.2 1.5 4.8 0 3.2-1.5 4.8 0'

const G = {
  // Full body: Peek presses the bar overhead.
  figureStrength: <>
    <rect className="f" x="1.8" y="1.6" width="2.6" height="5.2" rx="1.3" />
    <rect className="f" x="19.6" y="1.6" width="2.6" height="5.2" rx="1.3" />
    <path className="s1" d="M3.4 4.2h17.2" />
    <path className="s2" d="M9 11 7.4 4.8M15 11l1.6-6.2" />
    <circle className="f" cx="12" cy="15.4" r="6.6" />
    <Eyes x={12} y={15.4} />
  </>,
  // The muscle-group glyphs are one figure — Peek's head over a body — with only the worked
  // muscle at full ink and the rest at 40%, so the set reads as a family and a glance says what
  // the day trains. Back view: Peek faces away, so no eyes.
  chest: <>
    <Head />
    <Bust />
    <rect className="f" x="4.4" y="9.6" width="7" height="5.6" rx="2.6" />
    <rect className="f" x="12.6" y="9.6" width="7" height="5.6" rx="2.6" />
  </>,
  back: <>
    <Head away />
    <Bust />
    <path className="f r" d="M4.4 10.2C6.2 9.6 8 9.3 10.8 9v10.4H8.6C5.8 16 4.2 13.2 4.4 10.2ZM19.6 10.2C17.8 9.6 16 9.3 13.2 9v10.4h2.2c2.8-3.4 4.4-6.2 4.2-9.2Z" />
    <path className="f r" d="M12 7.8 8.8 9.8 12 12.8 15.2 9.8Z" />
  </>,
  shoulders: <>
    <Head />
    <Bust />
    <circle className="f" cx="5.4" cy="11" r="3.2" />
    <circle className="f" cx="18.6" cy="11" r="3.2" />
    <path className="f r" d="M8.2 8.6 12 8l3.8.6.6 2.2H7.6Z" />
  </>,
  // Arms: front double-biceps, fists up — the only one where the limbs, not the torso, light up.
  arm: <>
    <Head />
    <rect className="t" x="7.6" y="8.8" width="8.8" height="12.2" rx="3.4" />
    <path className="s3" d="M8.4 12 4.4 12.2 4 7M15.6 12l4 .2.4-5.2" />
    <circle className="f" cx="4" cy="5.6" r="2" />
    <circle className="f" cx="20" cy="5.6" r="2" />
    <circle className="f" cx="6.2" cy="10.4" r="2.5" />
    <circle className="f" cx="17.8" cy="10.4" r="2.5" />
  </>,
  // Legs: hips and up stay faint; both legs, thigh to foot, are lit.
  legs: <>
    <Head k={0.86} />
    <rect className="t" x="7" y="7.4" width="10" height="3" rx="1.5" />
    <path className="f r" d="M5.2 9.8h5.6L10 15.6l.5 3.4-.9 3.2H7.6L6.8 19l.4-3.4Z" />
    <path className="f r" d="M18.8 9.8h-5.6l.8 5.8-.5 3.4.9 3.2h2L17.2 19l-.4-3.4Z" />
  </>,
  // Core: the six-pack, as pills.
  abs: <>
    <Head />
    <Bust />
    <rect className="f" x="8.4" y="10.4" width="3" height="2.8" rx="1.4" />
    <rect className="f" x="12.6" y="10.4" width="3" height="2.8" rx="1.4" />
    <rect className="f" x="8.4" y="14" width="3" height="2.8" rx="1.4" />
    <rect className="f" x="12.6" y="14" width="3" height="2.8" rx="1.4" />
    <rect className="f" x="8.8" y="17.6" width="2.6" height="2.6" rx="1.3" />
    <rect className="f" x="12.6" y="17.6" width="2.6" height="2.6" rx="1.3" />
  </>,
  // Pull-ups: hanging from the bar by both arms.
  pullup: <>
    <path className="s2" d="M2.8 3.2h18.4" />
    <path className="s2" d="M7 3.8 9.6 10.4M17 3.8l-2.6 6.6" />
    <circle className="f" cx="12" cy="14.8" r="5.8" />
    <Eyes x={12} y={14.8} k={0.9} />
  </>,
  // Dumbbell with a face for a grip.
  dumbbell: <>
    <rect className="f" x="2" y="5.8" width="3.4" height="12.4" rx="1.7" />
    <rect className="f" x="18.6" y="5.8" width="3.4" height="12.4" rx="1.7" />
    <path className="s3" d="M5.4 12h2M16.6 12h2" />
    <rect className="f" x="7" y="8.2" width="10" height="7.6" rx="3.8" />
    <Eyes x={12} y={12} k={0.62} />
  </>,
  // Barbell: Peek rides the middle of the bar.
  barbell: <>
    <rect className="f" x="2.6" y="4.2" width="3" height="15.6" rx="1.5" />
    <rect className="f" x="18.4" y="4.2" width="3" height="15.6" rx="1.5" />
    <path className="s2" d="M5.6 12h2.4M16 12h2.4" />
    <circle className="f" cx="12" cy="12" r="5.8" />
    <Eyes x={12} y={12} k={0.85} />
  </>,
  kettlebell: <>
    <path className="s3" d="M6.2 11.6 5.8 8.2a6.2 6.2 0 0 1 12.4 0l-.4 3.4" />
    <path className="f" d="M12 10c5.4 0 9 2.8 9 6.1 0 3-2 4.9-5.2 4.9H8.2C5 21 3 19.1 3 16.1 3 12.8 6.6 10 12 10Z" />
    <Eyes x={12} y={15.8} k={0.9} />
  </>,
  // Plate: a disc with its ring and Peek in the hole.
  plate: <>
    <circle className="f" cx="12" cy="12" r="9.2" />
    <circle className="es" cx="12" cy="12" r="6.8" style={{ strokeWidth: 1.2 }} />
    <Eyes x={12} y={12} />
  </>,
  // Cable machine: pulley, pole, the stack — and Peek as the selector pad.
  machine: <>
    <circle className="f" cx="12" cy="3.4" r="1.8" />
    <path className="s1" d="M12 5v3.2" />
    <rect className="f" x="6.2" y="8" width="11.6" height="13.4" rx="3.6" />
    <Eyes x={12} y={12.6} k={0.8} />
    <g className="e"><rect x="8.8" y="16.2" width="6.4" height="1.5" rx=".75" /><rect x="8.8" y="18.5" width="6.4" height="1.5" rx=".75" /></g>
  </>,
  // Run: leaning into it, speed lines behind.
  figureRun: <>
    <path className="s1 t" d="M2.4 6.8h4M3.4 10.2h3.4" />
    <path className="s3" d="M13.4 11.8 11.4 16.2" />
    <path className="s2" d="M11.4 16.2l4.2 2.2-.6 3.2M11.4 16.2 7.8 19l-3 -.4M13.2 12.8l4.2 1M12.8 12.8 8.6 11.6" />
    <circle className="f" cx="14.6" cy="7.4" r="4.8" />
    <Eyes x={15} y={7.4} k={0.62} r={-24} />
  </>,
  bike: <>
    <circle className="s2" cx="5.4" cy="17.4" r="4" />
    <circle className="s2" cx="18.6" cy="17.4" r="4" />
    <path className="s2" d="M5.4 17.4l4.4-5h5.2l3.6 5M9.8 12.4 12 17.4M15 12.4l-.6-3.2h2.2" />
    <circle className="f" cx="11" cy="7.4" r="4.2" />
    <Eyes x={11.4} y={7.4} k={0.58} r={-20} />
  </>,
  // Swim: Peek's head above the water line.
  swim: <>
    <circle className="f" cx="12" cy="10.4" r="6.2" />
    <Eyes x={12} y={9.6} k={0.82} />
    <path className="e" d={WAVE + 'V24H0Z'} />
    <path className="s2" d={WAVE} />
    <path className="s2 t" d="M0 19.8c1.6-1.5 3.2-1.5 4.8 0s3.2 1.5 4.8 0 3.2-1.5 4.8 0 3.2 1.5 4.8 0 3.2-1.5 4.8 0" />
  </>,
  // Boxing: a glove in Peek's face — the knockout outline keeps them apart.
  boxing: <>
    <circle className="f" cx="7.8" cy="12.8" r="5.8" />
    <Eyes x={8.2} y={12.6} k={0.82} r={-8} />
    <path className="s2" d="M12.6 12.6h3" />
    <circle className="f sep" cx="18.2" cy="12.4" r="5.2" />
    <path className="es" d="M14.8 9v6.8" style={{ strokeWidth: 1.4 }} />
  </>,
  // Stopwatch: the dial is Peek's face.
  timer: <>
    <rect className="f" x="9.4" y="1.8" width="5.2" height="2.6" rx="1.3" />
    <path className="s2" d="M18.2 6l1.6-1.6" />
    <circle className="f" cx="12" cy="13.6" r="8.2" />
    <Eyes x={12} y={13.6} />
  </>,
  // Stretch: arms up, eyes closed and easy.
  stretch: <>
    <path className="s2" d="M7.4 10.6C4.4 8 6.2 3.2 12 3c5.8.2 7.6 5 4.6 7.6M10 17.4 9 19.8M14 17.4l1 2.4" />
    <rect className="f" x="6.4" y="19.6" width="5" height="2.4" rx="1.2" />
    <rect className="f" x="12.6" y="19.6" width="5" height="2.4" rx="1.2" />
    <circle className="f" cx="12" cy="12.8" r="5.6" />
    <Eyes x={12} y={12.8} k={0.9} calm />
  </>,
  // Sleep: Peek asleep. A rest day is the one that matters most and was a moon.
  moon: <>
    <circle className="f" cx="10.8" cy="13.4" r="7.6" />
    <Eyes x={10.6} y={13.4} calm />
    <path className="s2" d="M15.6 3.4h4.4l-4.4 4.6h4.4" />
  </>,
  // Heart: the body is the heart.
  heart: <>
    <path className="f" d="M12 21c-.5 0-.9-.2-1.3-.5L4 14.6a5.2 5.2 0 0 1 0-7.4 5 5 0 0 1 7 0l1 1 1-1a5 5 0 0 1 7 0 5.2 5.2 0 0 1 0 7.4l-6.7 5.9c-.4.3-.8.5-1.3.5Z" />
    <Eyes x={12} y={12.8} k={0.85} />
  </>,
  flame: <>
    <path className="f" d="M12 21.6c4.2 0 7-2.8 7-6.6 0-5-4.4-7.2-3.4-12.4-3.3 1-5.2 3.8-5.2 6.6 0 1.2-.6 2-1.6 2s-1.6-.9-1.6-2.3C5.6 10.4 5 12.6 5 15c0 3.8 2.8 6.6 7 6.6Z" />
    <Eyes x={12} y={16} k={0.8} />
  </>,
  // Bolt: Peek with a spark of it in front.
  bolt: <>
    <circle className="f" cx="12" cy="15.4" r="6.6" />
    <Eyes x={12} y={15.8} />
    <path className="f sep" d="M14.2 1.4 8.6 8.2h3.6l-.8 4.8 5.2-6.8h-3.6Z" />
  </>,
}

export default function Glyph({ name, size, className = '', style, ...rest }) {
  const d = G[name]
  if (!d) return <Icon name={name} size={size} className={className} style={style} {...rest} />
  const s = size ? { width: size, height: size } : null
  return (
    <svg className={'glyph ' + className} viewBox="0 0 24 24" aria-hidden="true" focusable="false"
      style={s ? { ...s, ...style } : style} {...rest}>
      {d}
    </svg>
  )
}

export const GLYPH_DRAWN = Object.keys(G)
