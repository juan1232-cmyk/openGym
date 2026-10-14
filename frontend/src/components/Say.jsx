import { useEffect, useImperativeHandle, useRef, useState } from 'react'

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const TYPE_MS = 24

// A line Peek says rather than shows: typed a character at a time while the orb's body bobs
// like a mouth, with a breath at each full stop. The untyped rest is laid out but invisible, so
// the bubble is its final size from the first letter and nothing under it moves.
// `label` (+ `labelClass`) is the small heading above the line (Home's verdict); `onDone` fires
// once the whole line is out; `ref` exposes finish() (show the rest now) and busy() — tapping
// through a line, the way the onboarding tour does. Everything else goes on the bubble.
export default function Say({ text, label, labelClass = '', orb, onDone, className = '', children, ref, ...rest }) {
  const [n, setN] = useState(reducedMotion() ? text.length : 0)
  const st = useRef({ i: 0, tm: 0, done: false })
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  useEffect(() => {
    const s = st.current = { i: 0, tm: 0, done: false }
    const end = () => { s.done = true; orb?.current?.talk(false); doneRef.current?.() }
    if (reducedMotion()) { setN(text.length); end(); return }
    setN(0)
    const step = () => {
      setN(++s.i)
      if (s.i >= text.length) return end()
      const c = text[s.i - 1], pause = '.!?'.includes(c) ? 280 : c === ',' ? 140 : 0
      orb?.current?.talk(!pause)
      s.tm = setTimeout(step, pause || TYPE_MS)
    }
    s.step = step
    s.tm = setTimeout(step, TYPE_MS)
    return () => { clearTimeout(s.tm); orb?.current?.talk(false) }
  }, [text])
  useImperativeHandle(ref, () => ({
    busy: () => !st.current.done,
    finish() {
      const s = st.current
      if (s.done) return
      clearTimeout(s.tm)
      s.i = text.length - 1
      s.step?.()
    }
  }), [text])
  return <div className={'pk-say ' + className} aria-hidden="true" {...rest}>
    {label && <span className={'pk-verdict ' + labelClass}>{label}</span>}
    <p>{text.slice(0, n)}<span className="rest">{text.slice(n)}</span></p>
    {children}
  </div>
}
