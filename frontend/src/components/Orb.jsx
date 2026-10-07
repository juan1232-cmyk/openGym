import { useEffect, useImperativeHandle, useRef } from 'react'
import { createOrbRig } from '../lib/orb-rig.js'

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

// The "Peek" mascot: a dark sphere whose two eyes look around, blink, and react when poked.
// Purely decorative — hidden from assistive tech, and tapping it only makes it squish.
// `ref` exposes react(expression, ms) so a screen can make it respond to something the user
// did (a set checked off) without the orb knowing anything about workouts. `mood` (one of
// orb-rig MOODS) is what it wanders through instead of the default glancing-around; `onPoke`
// lets the screen decide what a tap means instead of the fixed `poke` expression.
// `verdict` (lib/verdict.js) sets how the whole body moves while idle — bouncy when you're
// progressing, sagging when you're slipping — so it reads before any line does; `bump(kind)`
// is a one-shot body move (hop / nod / sink) for a single moment, like a set beating last time.
// `lookAt(x, y)` turns the head toward a point on screen (a finger), `lookAt()` lets it wander
// again; `talk(on)` makes the body bob like a mouth moving while a line is being said.
export default function Orb({ size, bias, pool, mood, verdict, inverted, poke = 'surprised-left', onPoke, className = '', style, ref }) {
  const l = useRef(null), r = useRef(null), body = useRef(null), rig = useRef(null)
  useEffect(() => {
    // a few expressions carry their own colour and body motion (the red, shaking angry-brows)
    const onLook = (c, m) => {
      const el = body.current
      if (!el) return
      el.style.backgroundColor = (c && c.body) || ''
      ;[l.current, r.current].forEach(e => { if (e) e.style.backgroundColor = (c && c.eyes) || '' })
      el.classList.toggle('shake', m === 'shake')
      el.classList.toggle('drift', m === 'drift')
    }
    rig.current = createOrbRig({ size, bias, pool, left: [l.current], right: [r.current], still: reducedMotion(), onLook })
    return () => rig.current.stop()
    // bias/pool are fixed per placement; re-creating the rig on every render would restart it
  }, [size])
  // after the effect above, so a re-created rig gets its mood back
  useEffect(() => { if (mood) rig.current?.setMood(mood) }, [mood, size])
  // a one-shot body animation by class, so it never fights React over className
  const once = (cls, ms) => {
    const el = body.current
    if (!el || el.classList.contains(cls) || reducedMotion()) return
    el.classList.add(cls)
    setTimeout(() => el.classList.remove(cls), ms)
  }
  const wrap = useRef(null)
  useImperativeHandle(ref, () => ({
    react: (name, ms) => rig.current?.react(name, ms),
    bump: kind => once('b-' + kind, 640),
    lookAt(x, y) {
      const el = wrap.current
      if (x == null || !el) return rig.current?.look()
      const b = el.getBoundingClientRect()
      // a point a hand's width away is already a big turn; past that it just keeps facing it
      const dx = (x - (b.left + b.width / 2)) / 180, dy = (y - (b.top + b.height / 2)) / 220
      rig.current?.look(-dy * 22, dx * 32)
    },
    talk: on => body.current?.classList.toggle('talking', !!on && !reducedMotion())
  }), [])
  const onClick = () => {
    if (onPoke) onPoke()
    else rig.current?.react(poke, 900)
    once('poke', 520)
  }
  return (
    <div ref={wrap} className={'orb-wrap ' + className + (verdict ? ' v-' + verdict : '')} style={style} onClick={onClick} aria-hidden="true">
      <div ref={body} className={'orb' + (inverted ? ' inv' : '') + (verdict ? ' v-' + verdict : '')} style={{ width: size, height: size }}>
        <i ref={l} /><i ref={r} />
      </div>
    </div>
  )
}
