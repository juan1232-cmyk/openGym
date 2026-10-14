import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { TOUR, tourProgress } from '../lib/onboard.js'
import Orb from './Orb.jsx'
import Say from './Say.jsx'

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const SETTLE = 420   // a route change animates in (#app.vt-*) before anything on it is measured
const ORB = 60

// Peek's tour of the app, right after the onboarding (S.toured === false). No Next buttons:
// a "look" stop moves on with a tap anywhere (the first tap finishes the line), a "do" stop
// spotlights a real control and only that control works — tapping it navigates for real.
// Every tap lands on this overlay first, so the tab bar never sees one: the Start tab can't
// begin a session, it just opens the start screen. Finishing or skipping sets toured.
export default function Tour() {
  const nav = useNavigate()
  const loc = useLocation()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const update = useStore(s => s.update)
  const [idx, setIdx] = useState(-1)
  const [rect, setRect] = useState(null)
  const [line, setLine] = useState(null)
  const [hint, setHint] = useState(false)
  const orb = useRef(null), say = useRef(null)
  const own = !S.routines.length
  const name = user?.name || S.name || t('friend')
  const stop = TOUR[idx]

  const finish = () => update(s => { s.toured = true })

  // start on Home, once it has settled in
  useEffect(() => {
    if (loc.pathname !== '/home') nav('/home')
    const tm = setTimeout(() => setIdx(0), 900)
    return () => clearTimeout(tm)
  }, [])

  // find the stop's target once its screen has finished arriving, and keep it found on resize
  useLayoutEffect(() => {
    if (!stop) return
    setRect(null); setHint(false); setLine(null)
    if (stop.at && loc.pathname !== stop.at) return
    let tm = 0
    const measure = () => {
      const el = stop.target && document.querySelector(`[data-tour="${stop.target}"]`)
      // a look stop's target goes to the top, under the progress bar, so the bottom of the
      // screen stays free for Peek and its bubble
      const top = (document.querySelector('.tour-top')?.getBoundingClientRect().bottom || 50) + 16
      if (el && stop.kind === 'look') scrollBy(0, el.getBoundingClientRect().top - top)
      const r = el && el.getBoundingClientRect()
      setRect(r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null)
    }
    tm = setTimeout(() => {
      measure()
      const text = stop.kind === 'end' ? t(stop.line, name) : t(own && stop.own ? stop.own : stop.line)
      setLine({ text, key: idx })
      if (stop.kind === 'do') orb.current?.react('downward-gaze', 1600)
      if (stop.kind === 'end') orb.current?.bump('lift')
    }, stop.kind === 'do' || idx === 0 ? 120 : SETTLE)
    addEventListener('resize', measure)
    return () => { clearTimeout(tm); removeEventListener('resize', measure) }
  }, [idx, loc.pathname])

  const next = () => setIdx(i => i + 1)
  const nudge = () => {
    orb.current?.react('wide-downward-gaze', 1200); orb.current?.bump('nod')
    setLine({ text: t('Over here.') + ' ' + t(stop.line), key: Date.now() })
  }
  const tap = e => {
    if (!stop || !line) return
    if (stop.kind === 'do') {
      const inside = rect && e && e.clientX >= rect.x - 6 && e.clientX <= rect.x + rect.w + 6 && e.clientY >= rect.y - 6 && e.clientY <= rect.y + rect.h + 6
      if (inside) { nav(stop.to); next() } else nudge()
    } else if (stop.kind === 'look') {
      if (say.current?.busy()) say.current.finish()
      else next()
    }
  }

  if (idx < 0 || !stop) return null
  // where Peek stands: above the control on a "do" stop; otherwise off the content, just
  // above the tab bar, so whatever is spotlit stays readable. On the first stop it sits on
  // Home's own coach orb and stays out of sight — that one is already there.
  const bar = document.getElementById('tabbar')?.getBoundingClientRect()
  const floor = bar ? bar.top - 18 : innerHeight - 110
  const first = stop.target === 'coach'
  const peek = stop.kind === 'do' && rect ? { x: rect.x + rect.w / 2 - ORB / 2, y: rect.y - ORB - 24 }
    : first && rect ? { x: rect.x, y: rect.y } : { x: 20, y: floor - ORB }
  const bubble = stop.kind === 'do' && rect
    ? { cls: 'over', style: { left: Math.max(16, Math.min(innerWidth - 16 - 240, rect.x + rect.w / 2 - 120)), top: peek.y - 10, width: 240 } }
    : first && rect ? { cls: 'under', style: { left: rect.x + 8, top: rect.y + rect.h + 12, maxWidth: Math.min(300, innerWidth - 32) } }
      : { cls: 'beside', style: { left: 20 + ORB + 10, top: floor, maxWidth: innerWidth - (20 + ORB + 10) - 20 } }
  const pad = stop.kind === 'do' ? 4 : 8
  // a tall target (the week list) would run under Peek: light only what's above it
  const lit = rect && stop.kind === 'look' && !first ? { ...rect, h: Math.min(rect.h, floor - ORB - 14 - pad - rect.y) } : rect
  const progress = tourProgress(idx)

  return <div className="tour" onClick={tap}>
    <div className={'tour-spot' + (lit && stop.kind !== 'end' ? ' on' : '')} style={lit ? {
      left: lit.x - pad, top: lit.y - pad, width: lit.w + pad * 2, height: lit.h + pad * 2, borderRadius: stop.kind === 'do' ? 99 : 22
    } : undefined} />
    {stop.kind === 'do' && rect && <div className="tour-ring" style={{ left: rect.x - 4, top: rect.y - 4, width: rect.w + 8, height: rect.h + 8 }} />}
    <div className={'tour-orb' + (first ? ' hidden' : '')} style={{ transform: `translate(${peek.x}px,${peek.y}px)` }}>
      {/* a poke reaches the overlay like any tap: on a look stop it moves on, on a do stop it nudges */}
      <Orb ref={orb} size={ORB} mood={stop.kind === 'end' ? 'happy' : 'curious'} />
    </div>
    {line && <div className={'tour-say ' + bubble.cls} style={bubble.style}>
      <Say key={line.key} ref={say} text={line.text} orb={orb} className={bubble.cls === 'under' ? 'up' : bubble.cls === 'over' ? 'down' : ''}
        onDone={() => {
          if (stop.kind === 'look') setHint(true)
          if (stop.kind === 'end') setTimeout(finish, reducedMotion() ? 600 : 1600)
        }}>
        {hint && <span className="tour-hint">{t('Tap anywhere to continue')}</span>}
      </Say>
    </div>}
    <div className="tour-top" onClick={e => e.stopPropagation()}>
      <div className="tour-prog" aria-hidden="true">{progress.map((p, i) => <i key={i} style={{ '--p': p }} />)}</div>
      <button className="tour-skip" onClick={() => { finish(); nav('/home') }}>{t('Skip tour')}</button>
    </div>
  </div>
}
