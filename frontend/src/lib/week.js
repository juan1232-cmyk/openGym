// Plan screen helpers. The week is stored Sunday-first (S.week keys 0..6, 0 = Sunday), but
// people read it Monday-first, so every list here runs Mon..Sun.
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

// The weekdays a routine is scheduled on, Monday-first (Sunday last).
export const daysOnRoutine = (week, routineId) =>
  WEEK_ORDER.filter(d => week && week[d] === routineId)

// First `max` names for a card, and how many were left off. A card shows "+N more" instead of
// growing with the routine, so the week stays scannable.
export function previewList(names, max = 4) {
  // a list one over the cap would show "+1 more", which takes the same room as the name itself
  const cut = names.length === max + 1 ? max + 1 : max
  return { shown: names.slice(0, cut), more: Math.max(0, names.length - cut) }
}
