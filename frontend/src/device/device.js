// The device page (device.html): the app in an iframe inside a drawn iPhone, and buttons that
// load demo profiles into it. Same origin as the app, which is what lets it write the app's
// localStorage and reach into the iframe to set the safe areas.
import './device.css'
import { SCENARIOS } from './scenarios.js'

const KEY = 'gym_state_v1'
const frame = document.getElementById('app')

// An iframe has no notch, so env(safe-area-inset-*) is 0 inside it and the app would draw under
// the Dynamic Island. Giving it the drawn iPhone's insets makes it lay out exactly as it does
// when added to the home screen (index.css reads them through --sat / --sab). Without the frame
// (on a real phone) it gets the phone's own insets instead, read here where env() works.
const narrow = matchMedia('(max-width: 640px)')
const insets = () => {
  if (!narrow.matches) return [54, 34]
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)'
  document.body.appendChild(probe)
  const cs = getComputedStyle(probe), v = [parseFloat(cs.paddingTop) || 0, parseFloat(cs.paddingBottom) || 0]
  probe.remove()
  return v
}
const applyInsets = () => {
  const doc = frame.contentDocument
  if (!doc || !doc.head) return
  const st = doc.getElementById('dv-insets') || doc.head.appendChild(Object.assign(doc.createElement('style'), { id: 'dv-insets' }))
  const [top, bottom] = insets()
  st.textContent = `:root:root:root{--sat:${top}px!important;--sab:${bottom}px!important}`
}
frame.addEventListener('load', applyInsets)
narrow.addEventListener('change', applyInsets)

// The phone is drawn at its real size and scaled down to fit the window — never up.
const fit = () => {
  const s = Math.min(1, (innerHeight - 40) / 880, (innerWidth - 32) / 421)
  document.documentElement.style.setProperty('--s', s.toFixed(3))
}
addEventListener('resize', fit); fit()

const clock = () => {
  const d = new Date()
  document.getElementById('time').textContent = (d.getHours() % 12 || 12) + ':' + String(d.getMinutes()).padStart(2, '0')
}
clock(); setInterval(clock, 15000)

// what this page was built from: Vercel's commit, or the local checkout (vite.config.js)
const b = __BUILD__
document.getElementById('build').textContent = b.sha
  ? 'Built from ' + b.sha.slice(0, 7) + (b.ref ? ' on ' + b.ref : '') + (b.msg ? ' — ' + b.msg.split('\n')[0] : '')
  : 'Local build'

// on a phone there's no frame — the app is the page — and the panel is a sheet behind a button
const fab = document.getElementById('fab')
const panel = open => { document.body.classList.toggle('dv-open', open); fab.setAttribute('aria-expanded', String(open)) }
fab.addEventListener('click', () => panel(!document.body.classList.contains('dv-open')))
document.getElementById('close').addEventListener('click', () => panel(false))

// Loading a scenario replaces what this browser has saved. On the hosted demo that's only ever
// demo data; on a local dev server it might be a real guest profile, so that one asks first.
const isDemo = raw => {
  try { const S = JSON.parse(raw); return !S || (S.workouts || []).every(w => String(w.id).startsWith('demo-')) } catch { return true }
}
// The app keeps its state in memory and writes it back on every change, so the demo is written
// while it isn't running: unload it, write, then load it fresh at the scenario's screen. (Just
// changing the src would only change the hash — the same app, still holding the old profile.)
const relaunch = (write, path) => {
  frame.addEventListener('load', () => { write(); frame.setAttribute('src', 'index.html#' + path) }, { once: true })
  frame.setAttribute('src', 'about:blank')
}
const load = key => {
  const sc = SCENARIOS[key]
  let raw = null
  try { raw = localStorage.getItem(KEY) } catch { /* storage blocked: nothing to protect */ }
  if (raw && !isDemo(raw) && !confirm('This replaces the training data saved in this browser. Continue?')) return
  relaunch(() => {
    try {
      ;['gym_dirty', 'gym_user', KEY].forEach(k => localStorage.removeItem(k))
      const state = sc.state(new Date())
      if (state) { localStorage.setItem('gym_guest', '1'); localStorage.setItem(KEY, JSON.stringify(state)) }
      else localStorage.removeItem('gym_guest')
    } catch { /* private mode without storage: the app still opens, just without the demo */ }
  }, sc.path || '/home')
  document.querySelectorAll('.dv-scenes button').forEach(el => el.classList.toggle('on', el.dataset.key === key))
  panel(false)
}

const scenes = document.getElementById('scenes')
Object.entries(SCENARIOS).forEach(([key, sc]) => {
  const el = document.createElement('button')
  el.type = 'button'; el.dataset.key = key; el.textContent = sc.label
  if (sc.verdict) el.dataset.verdict = sc.verdict
  el.addEventListener('click', () => load(key))
  scenes.appendChild(el)
})
document.getElementById('reload').addEventListener('click', () => frame.contentWindow.location.reload())

