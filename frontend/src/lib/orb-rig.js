// Eye rig for the "Peek" orb mascot — ported from the claude.ai/design project's orb-rig.js.
// The face lives on a sphere: head = [pitch (+up), yaw (+right), roll (+clockwise)], and each
// eye is an ellipse [w, h, lift, tilt°] placed on that sphere and projected back to 2D, which
// is what lets two plain divs read as a head turning rather than two dots sliding around.
//
// Two changes from the design's copy, both for a phone app rather than a design canvas:
// - rAF only. The original also armed a 50ms setTimeout every frame so it kept animating in
//   throttled preview iframes; in a real tab that just keeps the CPU awake in the background.
// - `still: true` places the eyes once and never schedules a frame (prefers-reduced-motion).
const R = 120, HEAD_K = 1.1, EYE_K = 1.12
export const EX = {
  'neutral':              { h: [0, 0, 0],               l: [20, 50, -7, 0],          r: [20, 50, -7, 0],           sp: 35 },
  'attentive-left':       { h: [1.43, 6.19, 10.56],     l: [23.84, 58.13, 0, 0],     r: [23.84, 58.13, 0, 0],      sp: 56.8 },
  'upward-side-glance':   { h: [7.3, 27.8, -16.1],      l: [22.5, 42.38, -20.5, 0],  r: [22.5, 42.38, -20.5, 0],   sp: 54.3 },
  'gentle-downward-gaze': { h: [-6.08, -11.04, -13.97], l: [23.05, 58.69, 0, 0],     r: [23.05, 58.69, 0, 0],      sp: 56.2 },
  'small-attentive':      { h: [-4.23, 14.36, 11.2],    l: [22.07, 39.6, 0, 0],      r: [22.07, 39.6, 0, 0],       sp: 50.9 },
  'curious-left':         { h: [-12.3, -17.6, 5.91],    l: [20.61, 47.77, 0, 23.52], r: [20.61, 47.77, 0, -24.04], sp: 54.9 },
  'downward-gaze':        { h: [-15.06, 0.14, -14.55],  l: [22.4, 54.57, 0, 0],      r: [22.4, 54.57, 0, 0],       sp: 57.7 },
  'far-right-glance':     { h: [0.32, 35.31, -10.9],    l: [22.46, 39.82, 0, 0],     r: [22.46, 39.82, 0, 0],      sp: 53.9 },
  'surprised-left':       { h: [2.95, -16.05, -20.92],  l: [51.68, 51.74, 0, 0],     r: [51.68, 51.74, 0, 0],      sp: 70.9 },
  'joyful-wide':          { h: [-2.09, -15.9, -14.47],  l: [34.2, 85.33, 0, 0],      r: [34.2, 83.18, 0, 0],       sp: 59.41 },
  'eyes-closed':          { h: [-8.75, -8.74, -10.77],  l: [56.13, 15.5, 0, 0],      r: [56.13, 15.16, 0, 0],      sp: 69.28 }
}
export const POOL = ['upward-side-glance', 'curious-left', 'attentive-left', 'downward-gaze', 'gentle-downward-gaze', 'small-attentive', 'far-right-glance', 'neutral']
// for an orb hanging above the content (the welcome screens): it looks down at what you read
export const DOWN = ['downward-gaze', 'gentle-downward-gaze', 'curious-left', 'small-attentive', 'neutral', 'attentive-left']
const CLOSED = EX['eyes-closed']
const lerp = (a, b, t) => a + (b - a) * t
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const D = Math.PI / 180
const mul = (A, B) => A.map(row => [0, 1, 2].map(j => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]))
const rotY = t => { const c = Math.cos(t), s = Math.sin(t); return [[c, 0, s], [0, 1, 0], [-s, 0, c]] }
const rotX = t => { const c = Math.cos(t), s = Math.sin(t); return [[1, 0, 0], [0, c, -s], [0, s, c]] }
const rotZ = t => { const c = Math.cos(t), s = Math.sin(t); return [[c, -s, 0], [s, c, 0], [0, 0, 1]] }
const col = (M, i) => [M[0][i], M[1][i], M[2][i]]

// opts: { size, left: [els], right: [els], bias: [pitch, yaw, roll], pool, still }
export function createOrbRig(opts) {
  const size = opts.size, S = size / (R * 2)
  const bias = opts.bias || [0, 0, 0]
  const pool = opts.pool || POOL
  let cur = 'neutral', from = EX.neutral, to = EX.neutral, frame = null
  let tStart = 0, trans = 500, hold = 1800, blinkAt = 2600, raf = 0, stopped = false
  const t0 = performance.now()

  const go = (name, now, tr, hd) => { from = frame || to; to = EX[name]; cur = name; tStart = now; trans = tr; hold = hd }
  const next = now => {
    const o = pool.filter(n => n !== cur)
    go(o[Math.floor(Math.random() * o.length)], now, 500, 3400 + Math.random() * 2200)
  }
  const blink = now => {
    const d = now - blinkAt
    if (d < 0) return 0
    const c = 95, h = 40, o = 145
    if (d > c + h + o) { blinkAt = now + 3400 + Math.random() * 2800; if (Math.random() < 0.15) blinkAt = now + 220; return 0 }
    if (d < c) return 1 - Math.pow(1 - d / c, 2)
    if (d < c + h) return 1
    return 1 - ease((d - c - h) / o)
  }

  const place = (els, e, dir, sp, H) => {
    const u = dir * sp / 2, v = e[2] * EYE_K
    const M = mul(H, mul(rotY(Math.asin(u / R)), mul(rotX(-Math.asin(v / R)), rotZ(e[3] * D))))
    const n = col(M, 2), ax = col(M, 0), ay = col(M, 1)
    const w = e[0] * EYE_K, h = e[1] * EYE_K
    const cx = R + n[0] * R, cy = R + n[1] * R
    const tx = (cx - ax[0] * w / 2 - ay[0] * h / 2) * S, ty = (cy - ax[1] * w / 2 - ay[1] * h / 2) * S
    const tf = 'matrix(' + ax[0] + ',' + ax[1] + ',' + ay[0] + ',' + ay[1] + ',' + tx + ',' + ty + ')'
    els.forEach(el => {
      if (!el) return
      el.style.width = w * S + 'px'; el.style.height = h * S + 'px'
      el.style.transformOrigin = '0 0'; el.style.transform = tf
      el.style.opacity = n[2] > 0 ? 1 : 0
    })
  }

  const tick = raw => {
    const now = raw - t0
    if (!opts.still && now > tStart + trans + hold) next(now)
    const p = ease(Math.min(1, (now - tStart) / trans))
    const mix = s => [0, 1, 2, 3].map(i => lerp(from[s][i], to[s][i], p))
    frame = { h: [0, 1, 2].map(i => lerp(from.h[i], to.h[i], p)), l: mix('l'), r: mix('r'), sp: lerp(from.sp, to.sp, p) }
    const b = opts.still ? 0 : blink(now)
    const eye = s => { const e = frame[s]; return [lerp(e[0], CLOSED[s][0], b), lerp(e[1], CLOSED[s][1], b), e[2], lerp(e[3], 0, b)] }
    const sp = lerp(frame.sp, CLOSED.sp, b) * EYE_K
    const [pi, ya, ro] = frame.h.map((v, i) => v + bias[i])
    const H = mul(rotZ(ro * D), mul(rotY(ya * HEAD_K * D), rotX(pi * HEAD_K * D)))
    place(opts.left, eye('l'), -1, sp, H)
    place(opts.right, eye('r'), 1, sp, H)
    if (!stopped && !opts.still) raf = requestAnimationFrame(tick)
  }
  tick(performance.now())

  return {
    // a still orb doesn't react either — the change of expression is itself motion
    react(name = 'surprised-left', ms = 900) { if (!opts.still) go(name, performance.now() - t0, 180, ms) },
    stop() { stopped = true; cancelAnimationFrame(raf) }
  }
}
