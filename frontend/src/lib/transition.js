// Which way a route change should animate, so the page moves the way the tab bar reads:
// a tab to the right slides in from the right, a drill-down pushes in like iOS, and going
// back reverses it. Only the incoming page animates — there is no exit animation, because
// the route is keyed and the old view is already gone.
const TABS = ['home', 'plan', 'stats', 'library']
// pages reached from a tab rather than being one; history lives under Stats, settings under Home
const DEPTH1 = ['history', 'settings', 'admin', 'exercise']

const section = p => p.split('/')[1] || 'home'
const depth = p => {
  const s = section(p)
  if (s === 'plan' && p.split('/').length > 2) return 1   // /plan/r/:id
  return DEPTH1.includes(s) ? 1 : 0
}

// 'fwd' | 'back' | 'up' | 'fade'
export function routeDir(from, to) {
  if (!from || from === to) return 'fade'
  if (section(to) === 'workout') return 'up'
  if (section(from) === 'workout') return 'fade'
  const d = depth(to) - depth(from)
  if (d) return d > 0 ? 'fwd' : 'back'
  const a = TABS.indexOf(section(from)), b = TABS.indexOf(section(to))
  if (a < 0 || b < 0 || a === b) return 'fade'
  return b > a ? 'fwd' : 'back'
}
