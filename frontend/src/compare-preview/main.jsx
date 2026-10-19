// The compare sheet on its own (compare.html), for reviewing it without clicking through the
// app: pick a pair, see the real Compare component with the real ratings, press Swap and watch
// the demo routine change. compare.html swaps in an in-memory localStorage before this runs, so
// nothing here can touch a real profile saved in the same browser.
import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import './preview.css'
import { useStore, DEF } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { bindUI } from '../components/ui.jsx'
import { Compare } from '../sheets/compare.jsx'
import Toast from '../components/Toast.jsx'
import { EXIDX } from '../lib/exercises.js'
import { PAIRS } from './pairs.js'

bindUI(useUI)

// A routine that plans a, so the dock offers Swap — and shows what Swap did.
const demoState = p => ({
  ...structuredClone(DEF), goal: 'muscle', toured: true,
  routines: [{ id: 'demo', name: 'Demo day', emoji: 'barbell', ex: [{ id: p.a, sets: 3, reps: 10, weight: 20 }] }]
})

function Preview() {
  const [i, setI] = useState(0)
  const [theme, setTheme] = useState(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  const [run, setRun] = useState(0)          // remounts the sheet on reset
  const routine = useStore(s => s.S.routines[0])
  const p = PAIRS[i]
  const reset = () => { useStore.getState().replaceState(demoState(p)); setRun(n => n + 1) }
  useEffect(reset, [i])
  useEffect(() => {
    const de = document.documentElement
    de.dataset.skin = 'peek'; de.dataset.theme = theme; de.dataset.accent = 'lime'; de.style.colorScheme = theme
  }, [theme])
  const planned = routine && routine.ex[0] && EXIDX[routine.ex[0].id]
  return <div className="cmpv">
    <header className="cmpv-head">
      <h1>Compare preview</h1>
      <p>The real compare sheet with the real ratings. Pick a pair, or change the alternative inside the sheet.</p>
      <div className="chips cmpv-pairs">
        {PAIRS.map((x, n) => <button key={n} className={'chip nocap' + (n === i ? ' on' : '')} onClick={() => setI(n)}>{x.label}</button>)}
      </div>
      <div className="cmpv-bar">
        <span>Demo day plans: <b className="capitalize">{planned ? planned.n : '—'}</b></span>
        <button className="chip nocap" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? 'Light' : 'Dark'}</button>
        <button className="chip nocap" onClick={reset}>Reset</button>
      </div>
    </header>
    <div className="sheet cmpv-sheet">
      <div className="grab" />
      {/* Keep and Swap close the sheet in the app; here that just redraws it, so a swap stays
          visible ("Demo day plans" above, and "Not in your plan" in the dock) until Reset */}
      <Compare key={i + ':' + run} aId={p.a} muscle={p.muscle} initial={p.b} close={() => setRun(n => n + 1)} />
    </div>
    <Toast />
  </div>
}

createRoot(document.getElementById('root')).render(<StrictMode><Preview /></StrictMode>)
