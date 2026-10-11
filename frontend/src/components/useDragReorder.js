import { useRef } from 'react'

// Drag-to-reorder for a list, without a library. Only a handle starts it — the handle has
// touch-action:none, so iOS hands the gesture to us instead of scrolling the page — and
// only after the finger has moved a few pixels, so a plain tap on the handle still opens
// its menu. During the drag nothing re-renders: the rows are moved with transforms and the
// result is committed once, on release, through `onMove(from, to)`.
//
// Rows are found by `data-idx` inside `containerRef`, so a row may sit inside a wrapper (a
// superset group) and still take part.
const SLOP = 6           // px of movement before a press becomes a drag
const EDGE = 90          // px from the top, or from the tab bar, where the page scrolls

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
      if (i === s.from) { el.style.transform = `translateY(${dy}px)`; return }
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

  const end = commit => {
    const s = st.current
    st.current = null
    if (!s) return
    cancelAnimationFrame(s.raf)
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
      if (Math.abs(pageY - s.startY) < SLOP) return
      s.dragging = true
      s.rows = rowsOf()
      s.rects = s.rows.map(el => { const r = el.getBoundingClientRect(); return { top: r.top + window.scrollY, height: r.height } })
      s.rows.forEach((el, i) => { el.style.transition = i === s.from ? 'none' : 'transform 160ms var(--ease)' })
      s.rows[s.from]?.classList.add('dragging')
      document.body.classList.add('reordering')
      s.raf = requestAnimationFrame(autoScroll)
    }
    e.preventDefault()
    layout(s, pageY)
  }

  const handle = (i, count) => ({
    onPointerDown: e => {
      if (e.button !== 0) return
      st.current = { id: e.pointerId, from: i, to: i, startY: e.clientY + window.scrollY, clientY: e.clientY, dragging: false }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove,
    onPointerUp: () => end(true),
    onPointerCancel: () => end(false),
    // the same moves from the keyboard, one step at a time
    onKeyDown: e => {
      if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); onMove(i, i - 1) }
      if (e.key === 'ArrowDown' && i < count - 1) { e.preventDefault(); onMove(i, i + 1) }
    },
  })

  // The click that follows a drag's release would open the handle's menu or the row.
  const consumeClick = () => justDragged.current

  return { handle, consumeClick }
}
