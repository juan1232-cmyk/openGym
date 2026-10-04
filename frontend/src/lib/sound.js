// WebAudio beeps + haptics (ported from the vanilla app). `enabled` gates sound.
let audioCtx = null
export function beep(enabled, freq, dur, when) {
  if (!enabled) return
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)()
    const o = audioCtx.createOscillator(), g = audioCtx.createGain()
    o.connect(g); g.connect(audioCtx.destination)
    o.frequency.value = freq || 880; o.type = 'sine'
    const t0 = audioCtx.currentTime + (when || 0)
    g.gain.setValueAtTime(0.001, t0)
    g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + (dur || 0.18))
    o.start(t0); o.stop(t0 + (dur || 0.18) + 0.05)
  } catch (e) { /* */ }
}
// Haptics. Android takes a Vibration API pattern (on, off, on… in ms). iOS Safari has no
// Vibration API, but since iOS 18 toggling an <input type="checkbox" switch> gives the system
// haptic tick, so there each "on" in the pattern becomes one tick at its start time. Like any
// iOS haptic from the web it only fires inside a tap (or shortly after one), so the rest timer
// running out stays silent there — the toast and sound still say it.
let tick = null
function iosTick() {
  if (!tick) {
    const label = document.createElement('label'), box = document.createElement('input')
    box.type = 'checkbox'; box.setAttribute('switch', ''); box.tabIndex = -1
    label.append(box); label.setAttribute('aria-hidden', 'true')
    label.style.cssText = 'position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;clip-path:inset(50%)'
    document.body.append(label); tick = label
  }
  tick.click()
}
export function vibrate(p) {
  try {
    if (navigator.vibrate) { navigator.vibrate(p); return }
    if (!/iP(hone|ad|od)/.test(navigator.userAgent) && !(navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent))) return
    const steps = Array.isArray(p) ? p : [p]
    for (let i = 0, at = 0; i < steps.length; at += steps[i], i++) if (i % 2 === 0) setTimeout(iosTick, at)
  } catch (e) { /* */ }
}
