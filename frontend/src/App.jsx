import { useEffect, useRef } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { useStore, needsGoals } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { bindUI } from './components/ui.jsx'
import { ACCENTS } from './lib/format.js'
import { setLang, useLang } from './lib/i18n.js'
import { setNav } from './lib/nav.js'
import { routeDir } from './lib/transition.js'
import { useWakeLock } from './lib/wakelock.js'
import { startFlow } from './sheets.jsx'
import Icon from './components/Icon.jsx'
import TabBar from './components/TabBar.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Modals from './components/Modals.jsx'
import Toast from './components/Toast.jsx'
import RestTimer from './components/RestTimer.jsx'
import Onboarding from './views/Onboarding.jsx'
import Tour from './components/Tour.jsx'
import ExerciseRoute from './views/Exercise.jsx'
import Home from './views/Home.jsx'
import Plan from './views/Plan.jsx'
import RoutineEdit from './views/RoutineEdit.jsx'
import Workout from './views/Workout.jsx'
import Stats from './views/StatsPage.jsx'
import History from './views/History.jsx'
import Library from './views/Library.jsx'
import Settings from './views/Settings.jsx'
import Admin from './views/Admin.jsx'

bindUI(useUI)   // lets the shared controls open sheets without importing the store at module scope

// The skin sits on top of the theme (see index.css), so the status-bar colour follows the
// skin when there is one — a light Peek page under a black status bar reads as a gap.
const SKIN_BAR = { peek: { light: '#f3f2ee', dark: '#0e0e0d' } }
const darkQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
const resolveTheme = appearance =>
  appearance === 'light' || appearance === 'dark' ? appearance : darkQuery?.matches ? 'dark' : 'light'
function applyPrefs(appearance, accent, skin, focus) {
  const de = document.documentElement
  const theme = resolveTheme(appearance)
  de.dataset.theme = theme
  de.dataset.accent = ACCENTS[accent] ? accent : 'lime'
  de.dataset.skin = skin
  // "focus" = no tab bar on screen (onboarding, a running workout); fixed bars sit lower then
  de.dataset.chrome = focus ? 'focus' : ''
  // native controls (date pickers, scrollbars) follow the page instead of the OS
  de.style.colorScheme = theme
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.content = SKIN_BAR[skin]?.[theme] || (theme === 'light' ? '#f2f2f7' : '#000000')
}

// Every screen wears the "Peek" design skin. It started on Home, Workout and an exercise's
// progress page and took over one screen per PR; the rest followed in one go once the
// exercise picker had moved over, so the app no longer switches look between tabs.
const skinFor = () => 'peek'

function Shell() {
  const navigate = useNavigate()
  const loc = useLocation()
  const { S, user, ready, pulling } = useStore()
  const isGuest = useStore(s => s.isGuest())
  const langV = useLang()   // re-renders the whole shell when the language (pack) changes
  const authed = user || isGuest
  useEffect(() => { setNav(navigate) }, [navigate])
  const onboarding = !!authed && needsGoals(S, ready, pulling)
  const cur = loc.pathname.split('/')[1] || 'home'
  const skin = skinFor()
  // A running session is a focus screen, the way the design draws it: no tab bar, a ‹ back to
  // Home in its place (the session keeps running; Home and the Start tab both say Resume).
  // An exercise's screen is a drill-down with its own ‹, drawn without one too.
  const hideTabs = onboarding || (cur === 'workout' && !!S.active) || cur === 'exercise'
  useEffect(() => {
    const apply = () => applyPrefs(S.appearance, S.accent, skin, hideTabs)
    apply()
    // on 'system', flipping the phone to dark at night re-skins the open app, not just the next launch
    if (S.appearance !== 'light' && S.appearance !== 'dark' && darkQuery) {
      darkQuery.addEventListener('change', apply)
      return () => darkQuery.removeEventListener('change', apply)
    }
  }, [S.appearance, S.accent, skin, hideTabs])
  useEffect(() => { setLang(S.lang || 'en') }, [S.lang])
  useEffect(() => { document.documentElement.lang = S.lang || 'en' }, [langV, S.lang])
  // every tab/route change starts at the top of the page
  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])
  // worked out during render so the re-keyed #app mounts with the right class; idempotent
  // per pathname, so StrictMode's second render reads back the same direction
  const last = useRef({ path: null, dir: 'fade' })
  if (last.current.path !== loc.pathname) {
    last.current = { path: loc.pathname, dir: routeDir(last.current.path, loc.pathname) }
  }
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
      <div id="app" className={'vt-' + last.current.dir} key={loc.pathname}>
        <ErrorBoundary>
          {/* keyed on auth: signing in to an empty account starts it over at the goal question */}
          {!authed || onboarding ? <Onboarding key={user ? 'in' : 'out'} /> : (
            <Routes>
              <Route path="/home" element={<Home />} />
              <Route path="/plan" element={<Plan />} />
              <Route path="/plan/r/:id" element={<RoutineEdit />} />
              <Route path="/workout" element={<Workout />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/history" element={<History />} />
              <Route path="/library" element={<Library />} />
              <Route path="/exercise/:id" element={<ExerciseRoute />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/admin" element={user?.admin ? <Admin /> : <Navigate to="/home" replace />} />
              <Route path="*" element={<Navigate to="/home" replace />} />
            </Routes>
          )}
        </ErrorBoundary>
      </div>
      {!hideTabs && <TabBar onStart={startFlow} />}
      {authed && !onboarding && S.toured === false && <Tour />}
      <RestTimer />
      <Modals />
      <Toast />
    </>
  )
}

export default function App() {
  const boot = useStore(s => s.boot)
  useEffect(() => { boot() }, [boot])
  return (
    <HashRouter>
      <Shell />
      <SpeedInsights />
    </HashRouter>
  )
}
