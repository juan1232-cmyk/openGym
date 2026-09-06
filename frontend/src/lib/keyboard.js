// How much of the screen the on-screen keyboard is covering, so the workout screen can dock
// a bar directly on top of it.
//
// iOS never resizes the layout viewport for the keyboard: `position:fixed` elements stay
// exactly where they were and the keyboard is drawn over them. window.innerHeight therefore
// does not move, and visualViewport is the only thing that reports the covered strip — so
// everything here is derived from it rather than from a resize listener on window.
import { useEffect } from 'react'

// Below this the shrink is the URL bar collapsing, a rotation, or a pinch — not a keyboard.
// The shortest real one (a phone in landscape) is still well over 100px.
const MIN_KB = 90

// Split out from the hook because it is the only part with any arithmetic in it, and the
// arithmetic is what silently breaks: offsetTop is non-zero once the page scrolls inside the
// visual viewport, which is exactly what iOS does to bring a focused field above the keyboard.
export function insetFrom(vv, innerHeight) {
  if (!vv) return 0
  const covered = innerHeight - vv.height - vv.offsetTop
  return covered > MIN_KB ? Math.round(covered) : 0
}

// Publishes the inset as a CSS variable instead of React state on purpose: the keyboard fires
// resize/scroll continuously while it animates in, and re-rendering the whole set list on every
// frame of that drops taps. CSS moves the bar; nothing re-renders.
export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const de = document.documentElement
    const apply = () => {
      const px = insetFrom(vv, window.innerHeight)
      de.style.setProperty('--kbi', px + 'px')
      de.classList.toggle('kb-open', px > 0)
    }
    apply()
    vv.addEventListener('resize', apply)
    vv.addEventListener('scroll', apply)
    return () => {
      vv.removeEventListener('resize', apply)
      vv.removeEventListener('scroll', apply)
      de.style.removeProperty('--kbi')
      de.classList.remove('kb-open')
    }
  }, [])
}
