import { useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { effectiveRoutine } from '../lib/history.js'
import { todayISO } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'

export default function TabBar({ onStart }) {
  const nav = useNavigate()
  const loc = useLocation()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const isGuest = useStore(s => s.isGuest())
  const cur = loc.pathname.split('/')[1] || 'home'
  const signedIn = !!(user || isGuest)
  const bar = useRef(null)
  const pill = useRef(null)
  const placed = useRef(false)
  const at = useRef('')          // where the pill was last put, 'left,width'
  // One pill for the whole bar, moved under whichever tab is on, so it slides between tabs
  // instead of each button lighting its own background. Measured off the button, so it follows
  // whatever width the bar lays the tabs out at on this screen.
  const place = slide => {
    const row = bar.current, el = pill.current
    if (!row || !el) return
    const b = row.querySelector('button.on')
    if (!b) { el.style.opacity = '0'; placed.current = false; return }
    // the first placement (mount, or back from a screen with no tab on) and a resize jump
    // straight there — a pill sliding in from the left edge would read as a glitch
    el.style.transition = slide && placed.current ? '' : 'none'
    el.style.width = b.offsetWidth + 'px'
    el.style.transform = `translateX(${b.offsetLeft}px)`
    el.style.opacity = '1'
    placed.current = true
    at.current = b.offsetLeft + ',' + b.offsetWidth
  }
  // signedIn too: the bar renders nothing before that, so on a first visit (welcome, then
  // onboarding, then Home) this ran with no bar and Home never changed to run it again, which
  // left Home's dark label on the dark bar with no pill behind it
  useLayoutEffect(() => { place(true) }, [cur, signedIn])
  // its own effect, not part of the one above: a ResizeObserver reports once as soon as it
  // starts observing, and re-creating it per tab change would snap the pill past its slide.
  // It watches the tabs, not just the bar: the Peek skin is applied after the bar's first
  // layout (App's effect runs after this one) and reshapes the tabs without resizing the bar.
  useLayoutEffect(() => {
    const row = bar.current
    if (!row) return
    // only when the tab under the pill really moved or changed width: a route change can resize
    // something mid-slide, and re-placing then would cancel the slide into a jump
    const ro = new ResizeObserver(() => {
      const b = row.querySelector('button.on')
      if (!placed.current || !b || at.current !== b.offsetLeft + ',' + b.offsetWidth) place(false)
    })
    ro.observe(row)
    row.querySelectorAll('button').forEach(b => ro.observe(b))
    return () => ro.disconnect()
  }, [signedIn])   // the bar only exists once signed in or a guest
  if (!signedIn) return null
  const on = k => cur === k || (cur === 'history' && k === 'stats') || (cur === 'settings' && k === 'home')

  const startWorkout = () => {
    if (!S.active) {
      const r = effectiveRoutine(S, todayISO())
      if (r && r.ex.length) { onStart(r.id); return }
    }
    nav('/workout')
  }
  const Tab = ({ k, icon, to, label }) => (
    <button className={on(k) ? 'on' : ''} onClick={() => nav(to)} data-tour={'tab-' + k}>
      <Icon name={icon} /><span>{label}</span>
    </button>
  )

  return (
    <nav id="tabbar" ref={bar}>
      <span className="tb-pill" ref={pill} aria-hidden="true" />
      <Tab k="home" icon="house" to="/home" label={t('Home')} />
      <Tab k="plan" icon="calendar" to="/plan" label={t('Plan')} />
      <button className={'start' + (S.active ? ' rec' : '') + (on('workout') ? ' on' : '')} onClick={startWorkout} data-tour="tab-start">
        <span className="cir"><Icon name={S.active ? 'play' : 'dumbbell'} /></span>
        <span>{S.active ? t('Resume') : t('Start')}</span>
      </button>
      <Tab k="stats" icon="chart" to="/stats" label={t('Stats')} />
      <Tab k="library" icon="list" to="/library" label={t('Exercises')} />
    </nav>
  )
}
