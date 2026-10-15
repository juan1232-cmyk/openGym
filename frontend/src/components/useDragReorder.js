import { useEffect, useRef } from 'react'

// Drag-to-reorder for a list, without a library. Two ways in:
//
// - The handle (`handle(i, n)`): it has touch-action:none, so iOS hands the gesture to us
//   instead of scrolling the page, and it becomes a drag after the finger has moved a few
//   pixels — so a plain tap on the handle still opens its menu.
// - The row itself (`row(i)`), the way iOS lists do it: press and hold still, the row lifts,
//   then it follows the finger. The row keeps normal touch-action, so a finger that moves
//   before the hold completes is a scroll and the press is dropped; once lifted, a
//   non-passive touchmove listener is what stops the page scrolling under the drag
//   (touch-action can't be changed mid-gesture).
//
// During the drag nothing re-renders: the rows are moved with transforms and the result is
// committed once, on release, through `onMove(from, to)`.
//
// Rows are found by `data-idx` inside `containerRef`, so a row may sit inside a wrapper (a
// superset group) and still take part.
const SLOP = 6           // px of movement before a press becomes a drag (or a hold, a scroll)
const HOLD = 400         // ms of holding still on a row before it lifts
const EDGE = 90          // px from the top, or from the tab bar, where the page scrolls
const LIFT = 'scale(1.03)'

export default function useDragReorder({ containerRef, onMove }) {
  const st = useRef(null)
  const justDragged = useRef(false)

  const rowsOf = () => [...(containerRef.current?.querySelectorAll('[data-idx]') || [])]

  const layout = (s, pageY) => {
    const dy = pageY - s.startY
    s.dy = dy
    // where the dragged row's middle now is, against the other rows' middles at the start
    const mid = s.rects[s.from].top + s.rects[s.from].height / 2 + dy
    let to = s.from
    s.rects.forEach((r, i) => {
      const m = r.top + r.height / 2
      if (i < s.from && mid < m) to = Math.min(to, i)
      if (i > s.from && mid > m) to = Math.max(to, i)
    })
    s.to = to
    const h = s.rects[s.from].height
    s.rows.forEach((el, i) => {
      if (i === s.from) { el.style.transform = `translateY(${dy}px) ${LIFT}`; return }
      const shift = s.from < to && i > s.from && i <= to ? -h : s.from > to && i < s.from && i >= to ? h : 0
      el.style.transform = shift ? `translateY(${shift}px)` : ''
    })
  }

  const autoScroll = () => {
    const s = st.current
    if (!s || !s.dragging) return
    const bottomEdge = window.innerHeight - EDGE - 60   // the floating tab bar sits there
    const v = s.clientY < EDGE ? -(EDGE - s.clientY) / 6 : s.clientY > bottomEdge ? (s.clientY - bottomEdge) / 6 : 0
    if (v) { window.scrollBy(0, v); layout(s, s.clientY + window.scrollY) }
    s.raf = requestAnimationFrame(autoScroll)
  }

  // while a row is lifted, the page must not scroll under the finger
  const blockScroll = e => { if (st.current?.dragging) e.preventDefault() }
  const unblock = () => document.removeEventListener('touchmove', blockScroll)
  useEffect(() => () => { clearTimeout(st.current?.timer); unblock() }, [])

  const lift = s => {
    s.dragging = true
    s.rows = rowsOf()
    s.rects = s.rows.map(el => { const r = el.getBoundingClientRect(); return { top: r.top + window.scrollY, height: r.height } })
    // a held row eases up into its lift; one picked up by the handle is already moving
    s.rows.forEach((el, i) => { el.style.transition = i !== s.from ? 'transform 160ms var(--ease)' : s.hold ? 'transform 120ms var(--ease)' : 'none' })
    s.rows[s.from]?.classList.add('dragging')
    document.body.classList.add('reordering')
    s.raf = requestAnimationFrame(autoScroll)
  }

  const end = commit => {
    const s = st.current
    st.current = null
    if (!s) return
    clearTimeout(s.timer)
    cancelAnimationFrame(s.raf)
    unblock()
    if (!s.dragging) return
    s.rows.forEach(el => { el.style.transform = ''; el.style.transition = ''; el.classList.remove('dragging') })
    document.body.classList.remove('reordering')
    justDragged.current = true
    setTimeout(() => { justDragged.current = false }, 300)
    if (commit && s.to !== s.from) onMove(s.from, s.to)
  }

  const onPointerMove = e => {
    const s = st.current
    if (!s || e.pointerId !== s.id) return
    s.clientY = e.clientY
    const pageY = e.clientY + window.scrollY
    if (!s.dragging) {
      const moved = Math.abs(e.clientY - s.startClientY) >= SLOP || Math.abs(e.clientX - s.startX) >= SLOP
      if (!moved) return
      // a row waiting on its hold that moves first is a scroll, not a drag
      if (s.hold) { end(false); return }
      lift(s)
    }
    e.preventDefault()
    // once the finger moves, the lifted row tracks it exactly instead of easing behind it
    if (s.hold && !s.tracking) { s.tracking = true; if (s.rows[s.from]) s.rows[s.from].style.transition = 'none' }
    layout(s, pageY)
  }

  const start = (e, i, hold) => {
    if (e.button !== 0) return
    end(false)
    const s = st.current = {
      id: e.pointerId, from: i, to: i, hold, dragging: false,
      startY: e.clientY + window.scrollY, startClientY: e.clientY, startX: e.clientX, clientY: e.clientY,
    }
    const target = e.currentTarget
    if (!hold) { target.setPointerCapture(e.pointerId); return }
    document.addEventListener('touchmove', blockScroll, { passive: false })
    s.timer = setTimeout(() => {
      if (st.current !== s) return
      try { target.setPointerCapture(s.id) } catch { /* pointer already gone */ }
      lift(s)
      layout(s, s.clientY + window.scrollY)
      navigator.vibrate?.(10)
    }, HOLD)
  }

  const handle = (i, count) => ({
    onPointerDown: e => { e.stopPropagation(); start(e, i, false) },
    onPointerMove,
    onPointerUp: () => end(true),
    onPointerCancel: () => end(false),
    // the same moves from the keyboard, one step at a time
    onKeyDown: e => {
      if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); onMove(i, i - 1) }
      if (e.key === 'ArrowDown' && i < count - 1) { e.preventDefault(); onMove(i, i + 1) }
    },
  })

  const row = i => ({
    // a press on a control inside the row (its set/rep pills) is that control's, not a hold
    onPointerDown: e => { if (!e.target.closest('button,input,select,textarea,a')) start(e, i, true) },
    onPointerMove,
    onPointerUp: () => end(true),
    onPointerCancel: () => end(false),
    // Android opens a context menu on a long press, iOS a callout on the picture
    onContextMenu: e => e.preventDefault(),
  })

  // The click that follows a drag's release would open the handle's menu or the row.
  const consumeClick = () => justDragged.current

  return { handle, row, consumeClick }
}
