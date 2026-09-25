import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useStore, needsGoals } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { bindUI } from './components/ui.jsx'
import { ACCENTS } from './lib/format.js'
import { setLang, useLang } from './lib/i18n.js'
import { setNav } from './lib/nav.js'
import { useWakeLock } from './lib/wakelock.js'
import { startFlow } from './sheets.jsx'
import Icon from './components/Icon.jsx'
import TabBar from './components/TabBar.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Modals from './components/Modals.jsx'
import Toast from './components/Toast.jsx'
import RestTimer from './components/RestTimer.jsx'
import Login from './views/Login.jsx'
import Goals from './views/Goals.jsx'
import Home from './views/Home.jsx'
import Plan from './views/Plan.jsx'
import RoutineEdit from './views/RoutineEdit.jsx'
import Workout from './views/Workout.jsx'
import Stats from './views/Stats.jsx'
import History from './views/History.jsx'
import Library from './views/Library.jsx'
import Settings from './views/Settings.jsx'
import Admin from './views/Admin.jsx'

bindUI(useUI)   // lets the shared controls open sheets without importing the store at module scope

// The skin sits on top of the theme (see index.css), so the status-bar colour follows the
// skin when there is one — a light Peek page under a black status bar reads as a gap.
const SKIN_BAR = { peek: '#f3f2ee', hairline: '#0a0a0a' }
function applyPrefs(theme, accent, skin) {
  const de = document.documentElement
  de.dataset.theme = theme === 'light' ? 'light' : 'dark'
  de.dataset.accent = ACCENTS[accent] ? accent : 'lime'
  de.dataset.skin = skin
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.content = SKIN_BAR[skin] || (de.dataset.theme === 'light' ? '#f2f2f7' : '#000000')
}

// Which design skin a screen wears. Both are scoped to the screens their design actually
// covers rather than replacing the theme — "Peek" is taking over screen by screen (one PR
// each), and Hairline keeps the ones Peek hasn't reached yet. Login has no route of its own
// (Shell renders it in place of <Routes>), so it is keyed on !authed instead of a pathname;
// the Goals onboarding step is the same kind of screen.
function skinFor(cur, authed, onboarding) {
  if (!authed || onboarding || cur === 'home') return 'peek'
  if (cur === 'workout') return 'hairline'
  return ''
}

function Shell() {
  const navigate = useNavigate()
  const loc = useLocation()
  const { S, user, ready, pulling } = useStore()
  const isGuest = useStore(s => s.isGuest())
  const langV = useLang()   // re-renders the whole shell when the language (pack) changes
  const authed = user || isGuest
  useEffect(() => { setNav(navigate) }, [navigate])
  const onboarding = !!authed && needsGoals(S, ready, pulling)
  const skin = skinFor(loc.pathname.split('/')[1] || 'home', authed, onboarding)
  useEffect(() => { applyPrefs(S.theme, S.accent, skin) }, [S.theme, S.accent, skin])
  useEffect(() => { setLang(S.lang || 'en') }, [S.lang])
  useEffect(() => { document.documentElement.lang = S.lang || 'en' }, [langV, S.lang])
  // every tab/route change starts at the top of the page
  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])
  // bound to the workout, not to the route — checking Stats mid-session keeps the screen on
  useWakeLock(!!S.active && S.keepAwake !== false)
  if (!ready && !authed) return (
    <div id="app">
      <div style={{ paddingTop: '44vh', display: 'flex', justifyContent: 'center', fontSize: 34, color: 'var(--label-3)' }}>
        <Icon name="dumbbell" />
      </div>
    </div>
  )

  return (
    <>
      {/* keyed on the route: a view that throws is contained, and switching tabs
          re-mounts the boundary, so the tab bar is always a way out */}
      <div id="app" className="vfade" key={loc.pathname}>
        <ErrorBoundary>
          {!authed ? <Login /> : onboarding ? <Goals /> : (
            <Routes>
              <Route path="/home" element={<Home />} />
              <Route path="/plan" element={<Plan />} />
              <Route path="/plan/r/:id" element={<RoutineEdit />} />
              <Route path="/workout" element={<Workout />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/history" element={<History />} />
              <Route path="/library" element={<Library />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/admin" element={user?.admin ? <Admin /> : <Navigate to="/home" replace />} />
              <Route path="*" element={<Navigate to="/home" replace />} />
            </Routes>
          )}
        </ErrorBoundary>
      </div>
      {!onboarding && <TabBar onStart={startFlow} />}
      <RestTimer />
      <Modals />
      <Toast />
    </>
  )
}

export default function App() {
  const boot = useStore(s => s.boot)
  useEffect(() => { boot() }, [boot])
  return <HashRouter><Shell /></HashRouter>
}
