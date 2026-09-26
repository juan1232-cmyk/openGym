import { useEffect, useImperativeHandle, useRef } from 'react'
import { createOrbRig } from '../lib/orb-rig.js'

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

// The "Peek" mascot: a dark sphere whose two eyes look around, blink, and react when poked.
// Purely decorative — hidden from assistive tech, and tapping it only makes it squish.
// `ref` exposes react(expression, ms) so a screen can make it respond to something the user
// did (a set checked off) without the orb knowing anything about workouts.
export default function Orb({ size, bias, pool, inverted, poke = 'surprised-left', className = '', style, ref }) {
  const l = useRef(null), r = useRef(null), body = useRef(null), rig = useRef(null)
  useEffect(() => {
    rig.current = createOrbRig({ size, bias, pool, left: [l.current], right: [r.current], still: reducedMotion() })
    return () => rig.current.stop()
    // bias/pool are fixed per placement; re-creating the rig on every render would restart it
  }, [size])
  useImperativeHandle(ref, () => ({ react: (name, ms) => rig.current?.react(name, ms) }), [])
  const onClick = () => {
    rig.current?.react(poke, 900)
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
