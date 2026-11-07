// Routine glyphs.
//
// Routines used to store a literal emoji in `r.emoji` ('💪', '🦵', …). The
// redesign stores an icon key instead, but the field keeps its name so existing
// synced state stays readable by both builds — no migration, no lost routines.
//
// glyphOf() accepts either form: a known icon key passes through, a legacy emoji
// is mapped, and anything unrecognised falls back to the default.

import { ICON_NAMES } from '../components/Icon.jsx'
import { GLYPH_DRAWN } from '../components/Glyph.jsx'

export const DEFAULT_GLYPH = 'figureStrength'

// The picker leads with the muscle group, because that is how most people name a day
// ("Chest", "Back", "Leg day", "Arms"). Then the other things a day can be: core and full
// body, cardio, recovery. Keys that are drawn but not offered here (barbell, plate, machine, the
// outline icons) still render for routines that already use them.
export const GLYPH_GROUPS = [
  { key: 'Muscle',    items: ['chest', 'back', 'shoulders', 'arm', 'legs'] },
  { key: 'Core & full body', items: ['abs', 'figureStrength', 'pullup', 'dumbbell', 'kettlebell'] },
  { key: 'Cardio',    items: ['figureRun', 'bike', 'swim', 'boxing', 'timer'] },
  { key: 'Recovery',  items: ['stretch', 'moon', 'heart', 'flame', 'bolt'] },
]
export const GLYPHS = GLYPH_GROUPS.flatMap(g => g.items)

// Legacy emoji → icon key, so routines created before the redesign keep a
// sensible glyph instead of all collapsing onto the default.
const LEGACY = {
  '💪': 'arm', '🦾': 'arm', '🫸': 'figureStrength', '🫷': 'pullup',
  '🏋️': 'dumbbell', '🏋': 'dumbbell', '🏋️‍♀️': 'dumbbell',
  '🦵': 'legs', '🍑': 'legs',
  '🔥': 'flame', '⚡': 'bolt', '💥': 'bolt', '🧨': 'bolt', '😤': 'flame',
  '🏃': 'figureRun', '🏃‍♀️': 'figureRun', '🚴': 'bike', '🏊': 'swim',
  '🤸': 'stretch', '🧘': 'stretch', '🧘‍♀️': 'stretch',
  '🥊': 'boxing', '🧗': 'pullup', '⛰️': 'figureRun', '🏔️': 'figureRun', '🚀': 'bolt',
  '🎯': 'target', '🏆': 'trophy', '🥇': 'medal', '⭐': 'star', '🌟': 'star',
  '👑': 'crown', '🛡️': 'shield', '⚔️': 'shield', '❤️‍🔥': 'heart',
  '🦍': 'kettlebell', '🐂': 'barbell', '🐻': 'kettlebell', '🦁': 'boxing',
  '🐺': 'figureRun', '🦈': 'swim', '🤖': 'machine',
}

export function glyphOf(v) {
  if (!v) return DEFAULT_GLYPH
  if (GLYPH_DRAWN.includes(v) || ICON_NAMES.includes(v)) return v
  if (LEGACY[v]) return LEGACY[v]
  // strip variation selectors / ZWJ sequences and retry the base emoji
  const base = [...v].filter(c => c !== '️' && c !== '‍')[0]
  return LEGACY[base] || DEFAULT_GLYPH
}
