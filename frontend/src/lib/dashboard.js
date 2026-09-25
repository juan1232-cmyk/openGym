// Numbers behind the Home dashboard (Peek design, D3) — kept out of the view so the week
// arithmetic can be tested without rendering anything.
import { isoOf, weekKey } from './format.js'

// Volume per calendar week (Mon–Sun) for the last `n` weeks, oldest first, ending with the
// week that contains `today`. A week with no training is 0, not skipped, so a gap in the
// chart is a gap in the training.
export function weeklyVolumes(workouts, n = 8, today = new Date()) {
  const noon = new Date(today); noon.setHours(12, 0, 0, 0)
  const keys = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(noon); d.setDate(noon.getDate() - i * 7)
    keys.push(weekKey(isoOf(d)))
  }
  const vol = Object.fromEntries(keys.map(k => [k, 0]))
  ;(workouts || []).forEach(w => { const k = weekKey(w.d); if (k in vol) vol[k] += w.vol || 0 })
  return keys.map(wk => ({ wk, vol: vol[wk] }))
}

// Bar heights (0–1 of the tallest) plus the chart's two highlights: the current week, and the
// best week — only when that is a different, earlier one, and never for an all-zero chart.
export function volumeBars(weeks) {
  const max = Math.max(0, ...weeks.map(w => w.vol))
  const last = weeks.length - 1
  const best = max > 0 ? weeks.findIndex(w => w.vol === max) : -1
  return weeks.map((w, i) => ({ ...w, h: max ? w.vol / max : 0, cur: i === last, best: i === best && i !== last }))
}

// Which greeting the header opens with. Small hours count as evening — nobody reads
// "Morning" at 2am as meant for them.
export const partOfDay = hour => (hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 18 ? 'afternoon' : 'evening')
