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
  'eyes-closed':          { h: [-8.75, -8.74, -10.77],  l: [56.13, 15.5, 0, 0],      r: [56.13, 15.16, 0, 0],      sp: 69.28 },
  // the rest of grok-bot.avatar.json, for the coach's moods
  'skeptical-right':       { h: [-16.53, -3.77, -13.73], l: [23.09, 57.68, 0, 0],       r: [49.92, 12.43, 0, 0],      sp: 56.3 },
  'skeptical-left':        { h: [3.53, -7.08, 9.83],     l: [24.31, 59.28, 0, 0],       r: [48.92, 13.41, 0, 0],      sp: 62.22 },
  'suspicious-right':      { h: [-17.8, 10, -10.89],     l: [23.97, 55.89, -9.8, 0],    r: [53.56, 13.33, -9.8, 0],   sp: 59.94 },
  'wide-downward-gaze':    { h: [-19.21, 15.2, 11.8],    l: [52.08, 51.47, 0, 0],       r: [53.11, 52.19, 0, 0],      sp: 69.5 },
  'wide-down-left':        { h: [-17.13, 18.07, 13.89],  l: [35.45, 79.1, 0, 0],        r: [35.45, 79.1, 0, 0],       sp: 70.8 },
  'surprised-wide-left':   { h: [-5.43, -11.71, -13.47], l: [51.4, 50.1, 0, 0],         r: [50.5, 49.4, 0, 0],        sp: 69 },
  'asymmetric-down-right': { h: [-20.06, 12.61, -12.7],  l: [42.5, 41.8, 0, 0],         r: [22.1, 22.2, 0, 0],        sp: 61.7 },
  'asymmetric-up-left':    { h: [6.59, 4.74, 12.84],     l: [42.1, 41.7, 0, 0],         r: [22.2, 22.1, 0, 0],        sp: 60.4 },
  'joyful-down-right':     { h: [-15.29, 15.01, 12.79],  l: [31.25, 76.72, 0, 0],       r: [31.25, 76.72, 0, 0],      sp: 68.7 },
  'playful-right':         { h: [-4.4, 14.07, -16.13],   l: [19.05, 43.37, 0, 26.29],   r: [19.05, 43.37, 0, -20.25], sp: 51.73 },
  'sleepy-squint':         { h: [3.4, 13.23, 8.98],      l: [51.78, 13.03, 0, 0],       r: [51.78, 13.03, 0, 0],      sp: 63.87 },
  'drowsy-closed':         { h: [10.29, 3.4, 7.58],      l: [55.67, 14.62, 0, 0],       r: [55.67, 14.62, 0, 0],      sp: 68.42 },
  'shy-downward':          { h: [7.13, 7.78, 3.94],      l: [21.5, 32, 40, 0],          r: [23.2, 33.5, 40, 0],       sp: 51.2 },
  'angry-right':           { h: [8.06, 17.63, -11.12],   l: [20.91, 40.4, 0, -30.87],   r: [20.91, 40.4, 0, 28.78],   sp: 52.06 },
  'angry-left':            { h: [-14.75, -19.35, 5.63],  l: [19.6, 48.64, 0, -27.61],   r: [19.6, 48.64, 0, 26.15],   sp: 55.1 },
  // the two with a look of their own: `c` recolours the sphere, `m` moves the whole body
  'angry-brows':           { h: [10.47, 5.09, 4.7],      l: [27.13, 63.03, 0, -36.24],  r: [27.13, 63.03, 0, 27.73],  sp: 68.7,
                             c: { body: '#ba3636', eyes: '#610000' }, m: 'shake' },
  'uneasy-left':           { h: [-12.3, -17.6, 5.91],    l: [20.61, 47.77, 0, 23.52],   r: [20.61, 47.77, 0, -24.04], sp: 54.9,
                             c: { body: '#adc3ff' }, m: 'drift' }
}
export const POOL = ['upward-side-glance', 'curious-left', 'attentive-left', 'downward-gaze', 'gentle-downward-gaze', 'small-attentive', 'far-right-glance', 'neutral']
// for an orb hanging above the content (the welcome screens): it looks down at what you read
export const DOWN = ['downward-gaze', 'gentle-downward-gaze', 'curious-left', 'small-attentive', 'neutral', 'attentive-left']
// A mood is a pool the orb wanders through, how long it holds each look, and how often it
// blinks — the JSON's named animations, with a few pools widened so a mood doesn't loop
// visibly. `angry` is the only way into angry-brows (the red one), and it only lands there
// on some of its turns, which is the point: it shouldn't be predictable.
const IDLE_BLINK = [3400, 6200], BUSY_BLINK = [2800, 5000], FAST_BLINK = [1800, 3600], SLOW_BLINK = [6500, 9500]
export const MOODS = {
  idle:         { pool: POOL, hold: [3400, 5600], blink: IDLE_BLINK },
  curious:      { pool: ['surprised-left', 'surprised-wide-left', 'upward-side-glance', 'far-right-glance', 'curious-left'], hold: [2300, 3600], blink: BUSY_BLINK },
  happy:        { pool: ['joyful-down-right', 'joyful-wide', 'playful-right', 'gentle-downward-gaze'], hold: [2300, 3400], blink: BUSY_BLINK },
  proud:        { pool: ['far-right-glance', 'curious-left', 'joyful-down-right', 'joyful-wide'], hold: [2300, 3400], blink: BUSY_BLINK },
  playful:      { pool: ['joyful-down-right', 'playful-right', 'joyful-wide', 'curious-left'], hold: [1800, 3000], blink: BUSY_BLINK },
  celebrate:    { pool: ['joyful-down-right', 'playful-right', 'joyful-wide', 'surprised-wide-left'], hold: [1400, 2300], blink: FAST_BLINK },
  excited:      { pool: ['joyful-down-right', 'playful-right', 'surprised-wide-left', 'surprised-left', 'joyful-wide'], hold: [1400, 2300], blink: FAST_BLINK },
  suspicious:   { pool: ['skeptical-left', 'skeptical-right', 'suspicious-right'], hold: [2300, 3600], blink: BUSY_BLINK },
  disappointed: { pool: ['downward-gaze', 'shy-downward', 'uneasy-left', 'gentle-downward-gaze'], hold: [3000, 4600], blink: IDLE_BLINK },
  angry:        { pool: ['angry-right', 'angry-left', 'angry-brows'], hold: [1800, 3000], blink: BUSY_BLINK },
  bored:        { pool: ['sleepy-squint', 'drowsy-closed', 'upward-side-glance'], hold: [3600, 5200], blink: SLOW_BLINK },
  drowsy:       { pool: ['sleepy-squint', 'drowsy-closed', 'eyes-closed'], hold: [3600, 5200], blink: SLOW_BLINK }
}
const CLOSED = EX['eyes-closed']
const lerp = (a, b, t) => a + (b - a) * t
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const D = Math.PI / 180
const mul = (A, B) => A.map(row => [0, 1, 2].map(j => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]))
const rotY = t => { const c = Math.cos(t), s = Math.sin(t); return [[c, 0, s], [0, 1, 0], [-s, 0, c]] }
const rotX = t => { const c = Math.cos(t), s = Math.sin(t); return [[1, 0, 0], [0, c, -s], [0, s, c]] }
const rotZ = t => { const c = Math.cos(t), s = Math.sin(t); return [[c, -s, 0], [s, c, 0], [0, 0, 1]] }
const col = (M, i) => [M[0][i], M[1][i], M[2][i]]

const between = ([a, b]) => a + Math.random() * (b - a)

// opts: { size, left: [els], right: [els], bias: [pitch, yaw, roll], pool, still,
//         onLook(colors|null, motion|null) — told whenever the sphere's own look changes }
export function createOrbRig(opts) {
  const size = opts.size, S = size / (R * 2)
  const bias = opts.bias || [0, 0, 0]
  let pool = opts.pool || POOL, holdR = MOODS.idle.hold, blinkR = MOODS.idle.blink
  let cur = 'neutral', from = EX.neutral, to = EX.neutral, frame = null, look = null
  let tStart = 0, trans = 500, hold = 1800, blinkAt = 2600, raf = 0, stopped = false
  // where it's looking on top of the expression's own head pose ([pitch, yaw]) — eased toward
  // `gazeTo` every frame, so following a finger reads as the head turning, not snapping
  let gaze = [0, 0], gazeTo = [0, 0]
  const t0 = performance.now()

  const go = (name, now, tr, hd) => {
    from = frame || to; to = EX[name]; cur = name; tStart = now; trans = tr; hold = hd
    // body colour/motion is motion too, so a still orb keeps its plain black
    const nl = opts.still ? null : (to.c || to.m ? to : null)
    if (nl !== look) { look = nl; opts.onLook && opts.onLook(nl && nl.c || null, nl && nl.m || null) }
  }
  const pick = () => {
    const o = pool.filter(n => n !== cur)
    return o[Math.floor(Math.random() * o.length)] || cur
  }
  const next = now => go(pick(), now, 500, between(holdR))
  const blink = now => {
    const d = now - blinkAt
    if (d < 0) return 0
    const c = 95, h = 40, o = 145
    if (d > c + h + o) { blinkAt = now + between(blinkR); if (Math.random() < 0.15) blinkAt = now + 220; return 0 }
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
    gaze = gaze.map((g, i) => g + (gazeTo[i] - g) * 0.12)
    const [pi, ya, ro] = frame.h.map((v, i) => v + bias[i] + (i < 2 ? gaze[i] : 0))
    const H = mul(rotZ(ro * D), mul(rotY(ya * HEAD_K * D), rotX(pi * HEAD_K * D)))
    place(opts.left, eye('l'), -1, sp, H)
    place(opts.right, eye('r'), 1, sp, H)
    if (!stopped && !opts.still) raf = requestAnimationFrame(tick)
  }
  tick(performance.now())

  return {
    // a still orb doesn't react either — the change of expression is itself motion
    react(name = 'surprised-left', ms = 900) { if (!opts.still) go(name, performance.now() - t0, 180, ms) },
    // Swap what it wanders through, starting now. A still orb just shows the mood's first
    // face, placed once — a face is information, not motion.
    setMood(name) {
      const m = MOODS[name] || MOODS.idle
      pool = m.pool; holdR = m.hold; blinkR = m.blink
      const now = performance.now() - t0
      if (!opts.still) return go(pick(), now, 500, between(holdR))
      from = to = EX[pool[0]]; frame = null; cur = pool[0]; tStart = now - 1; trans = 1
      tick(performance.now())
    },
    // Turn the head toward something, in degrees (+pitch up, +yaw right); look() with no
    // arguments goes back to wandering. A still orb keeps facing forward.
    look(pitch = 0, yaw = 0) {
      const cl = (v, m) => Math.max(-m, Math.min(m, v))
      if (!opts.still) gazeTo = [cl(pitch, 22), cl(yaw, 32)]
    },
    stop() { stopped = true; cancelAnimationFrame(raf) }
  }
}
