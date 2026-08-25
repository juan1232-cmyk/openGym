// Shared building blocks used across every sheet module: the store/UI accessors nearly every
// sheet reaches for, the generic confirm dialog, and the weight-picker control shared by body
// weight, goal weight and top-set weight entry.
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { fmtNum } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import Icon from '../components/Icon.jsx'
import { Button, Slider } from '../components/ui.jsx'

export const S = () => useStore.getState().S
export const update = (...a) => useStore.getState().update(...a)
export const ui = () => useUI.getState()
export const toast = m => ui().toast(m)
export const snd = () => S().sound

/* ============================ custom confirm dialog ============================ */
function ConfirmDialog({ title, message, confirmText, cancelText, danger, onConfirm, close }) {
  return <div style={{ textAlign: 'center', padding: '4px 0' }}>
    {title && <h3 style={{ marginBottom: 8 }}>{title}</h3>}
    <div className="muted" style={{ marginBottom: 18, lineHeight: 1.5 }}>{message}</div>
    <button className={'btn ' + (danger ? 'danger' : 'primary')} onClick={() => { close(); onConfirm && onConfirm() }}>{confirmText || t('Confirm')}</button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{cancelText || t('Cancel')}</Button>
  </div>
}
// Themed replacement for window.confirm — callback-based (no blocking).
export function confirmSheet(opts) {
  ui().openSheet(close => <ConfirmDialog {...opts} close={close} />, { kind: 'center' })
}

/* ============================ weight picker (shared: body weight, goal, top-set) ============================ */
// Fixed range, not a moving window — a window that resizes itself mid-drag (the previous
// attempt) makes the thumb's position unpredictable: every time it grows, everything already
// placed on it shifts toward one side. A static range never has that problem, at the cost of
// coarser precision per pixel — the +/- buttons cover exact values.
// The ceiling follows the profile's unit: 300 covers a body weight or a working weight in
// kg, but as pounds it cut off at 136 kg — below plenty of people's body weight, and well
// below an everyday squat.
const W_LO = 1
const wHi = unit => (unit === 'lb' ? 660 : 300)
export function WeightInput({ value, setValue, unit }) {
  const W_HI = wHi(unit)
  const clamp = x => Math.max(W_LO, Math.min(W_HI, Math.round((x || 0) * 10) / 10))
  const sv = Math.max(W_LO, Math.min(W_HI, value))
  const onSlide = v => setValue(clamp(v))
  return <>
    <div className="bwstep">
      <button className="bw-pm" onClick={() => onSlide(value - 0.1)} aria-label="minus 0.1"><Icon name="minus" /></button>
      <div className="bw-read">{fmtNum(value)}<span className="u"> {unit}</span></div>
      <button className="bw-pm" onClick={() => onSlide(value + 0.1)} aria-label="plus 0.1"><Icon name="plus" /></button>
    </div>
    <div className="chips" style={{ justifyContent: 'center', margin: '8px 0' }}>
      <button className="chip" onClick={() => onSlide(value - 1)}>−1</button>
      <button className="chip" onClick={() => onSlide(value - 0.5)}>−0.5</button>
      <button className="chip" onClick={() => onSlide(value + 0.5)}>+0.5</button>
      <button className="chip" onClick={() => onSlide(value + 1)}>+1</button>
    </div>
    <Slider value={sv} min={W_LO} max={W_HI} step={0.5} onChange={onSlide} />
  </>
}
