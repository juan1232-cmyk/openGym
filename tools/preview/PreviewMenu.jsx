import { useState } from 'react'
import { SCENARIOS, BONDS } from './scenarios.js'
import { stageOf } from '../../frontend/src/lib/peek/memory.js'

// Only in the preview build: jump to a situation, change how well Peek knows you, start over.
// Every option writes the guest profile straight into localStorage and reloads the app.
const KEY = 'gym_state_v1'
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} } }
// write a situation into storage; `load` also reloads the app into it
export function seed(sc) {
  try {
    localStorage.setItem('gym_guest', '1')
    localStorage.setItem(KEY, JSON.stringify(sc.state()))
    localStorage.setItem('pv_scenario', sc.id)
    if (sc.night) {
      const t = new Date(); t.setHours(2, 14, 0, 0)
      sessionStorage.setItem('pv_clock', String(t.getTime() - Date.now()))
    } else sessionStorage.removeItem('pv_clock')
  } catch { /* storage blocked: nothing to switch */ }
}
export function load(sc) {
  seed(sc)
  location.hash = '#/home'
  location.reload()
}

export default function PreviewMenu() {
  const [open, setOpen] = useState(false)
  let cur = 'regular'
  try { cur = localStorage.getItem('pv_scenario') || 'regular' } catch { /* */ }
  const st = read()
  const bond = st.peek ? st.peek.bond || 0 : 0
  const setBond = b => {
    const s = read(); s.peek = { ...(s.peek || {}), bond: b }
    try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* */ }
    location.reload()
  }
  return <>
    <button className="pv-pill" onClick={() => setOpen(true)} aria-label="Preview options">Preview</button>
    {open && <div className="pv-back" onClick={() => setOpen(false)}>
      <div className="pv-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label="Preview options">
        <div className="pv-h"><b>Preview</b><button onClick={() => setOpen(false)} aria-label="Close">Close</button></div>
        <p className="pv-note">The real openGym app with example data. Nothing here leaves this browser.</p>
        <span className="pv-lbl">Situation</span>
        {SCENARIOS.map(sc => <button key={sc.id} className={'pv-row' + (sc.id === cur ? ' on' : '')} onClick={() => load(sc)}>
          <b>{sc.label}</b><span>{sc.hint}</span>
        </button>)}
        <span className="pv-lbl">How well Peek knows you</span>
        <div className="pv-seg">{BONDS.map(([n, b]) =>
          <button key={n} className={stageOf(bond) === stageOf(b) ? 'on' : ''} onClick={() => setBond(b)}>{n}</button>)}</div>
        <button className="pv-reset" onClick={() => load(SCENARIOS.find(s => s.id === cur) || SCENARIOS[0])}>Start this situation over</button>
      </div>
    </div>}
  </>
}
