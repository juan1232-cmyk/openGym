import { useEffect, useState } from 'react'

// Peek's speech bubble: `line` appears after `delay` ms and, with `hideAfter`, goes away again.
// A new `line` restarts it. Nothing renders while there's nothing to say — silence is allowed.
export default function PeekSay({ line, delay = 0, hideAfter = 0, className = '' }) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    setShown(false)
    if (!line) return
    const a = setTimeout(() => setShown(true), delay)
    const b = hideAfter ? setTimeout(() => setShown(false), delay + hideAfter) : 0
    return () => { clearTimeout(a); clearTimeout(b) }
  }, [line])
  return shown && line ? <p className={'pk-say ' + className} aria-live="polite">{line}</p> : null
}
