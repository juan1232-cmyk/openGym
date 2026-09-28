import { useEffect, useImperativeHandle, useRef } from 'react'
import { createOrbRig } from '../lib/orb-rig.js'

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

// The "Peek" mascot: a dark sphere whose two eyes look around, blink, and react when poked.
// Purely decorative — hidden from assistive tech, and tapping it only makes it squish.
// `ref` exposes react(expression, ms) so a screen can make it respond to something the user
// did (a set checked off) without the orb knowing anything about workouts. `mood` (one of
// orb-rig MOODS) is what it wanders through instead of the default glancing-around; `onPoke`
// lets the screen decide what a tap means instead of the fixed `poke` expression.
export default function Orb({ size, bias, pool, mood, inverted, poke = 'surprised-left', onPoke, className = '', style, ref }) {
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
  useImperativeHandle(ref, () => ({ react: (name, ms) => rig.current?.react(name, ms) }), [])
  const onClick = () => {
    if (onPoke) onPoke()
    else rig.current?.react(poke, 900)
    const el = body.current
    if (!el || el.classList.contains('poke')) return
    el.classList.add('poke')
    setTimeout(() => el.classList.remove('poke'), 520)
  }
  return (
    <div className={'orb-wrap ' + className} style={style} onClick={onClick} aria-hidden="true">
      <div ref={body} className={'orb' + (inverted ? ' inv' : '')} style={{ width: size, height: size }}>
        <i ref={l} /><i ref={r} />
      </div>
    </div>
  )
}
