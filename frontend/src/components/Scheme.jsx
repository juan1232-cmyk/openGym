// Sets and reps by tapping, not by pressing + and − (lib/scheme.js holds the rules). Used
// twice: as pills on every exercise in the routine editor, so the whole plan is adjusted
// from one screen, and as chip rows in the exercise sheet.
import { useState } from 'react'
import { fmtNum } from '../lib/format.js'
import { isBw, repRangeOf } from '../lib/history.js'
import { SET_CHOICES, REP_CHOICES, withRepRange } from '../lib/scheme.js'
import { t } from '../lib/i18n.js'
import { Button, Stepper } from './ui.jsx'
import { ui } from '../sheets/common.jsx'

export const repsLabel = (lo, hi) => (lo === hi ? fmtNum(lo) : fmtNum(lo) + '–' + fmtNum(hi))

/** One row of set counts. */
export function SetsChips({ value, onPick }) {
  return <div className="chips scheme-chips">
    {SET_CHOICES.map(n => <button key={n} className={'chip' + (value === n ? ' on' : '')} onClick={() => onPick(n)}>{n}</button>)}
  </div>
}

/**
 * One row of rep ranges, plus Custom: two steppers for a range the presets don't have. A
 * range that isn't one of the presets opens on Custom so you see what is actually planned.
 */
export function RepsChips({ cfg, onPick }) {
  const { lo, hi } = repRangeOf(cfg)
  const preset = REP_CHOICES.some(([a, b]) => a === lo && b === hi)
  const [custom, setCustom] = useState(!preset && lo > 0)
  const [from, setFrom] = useState(lo || 8)
  const [to, setTo] = useState(hi || 12)
  return <>
    <div className="chips scheme-chips">
      {REP_CHOICES.map(([a, b]) => <button key={a + '-' + b} className={'chip' + (!custom && a === lo && b === hi ? ' on' : '')}
        onClick={() => { setCustom(false); onPick(a, b) }}>{repsLabel(a, b)}</button>)}
      <button className={'chip nocap' + (custom ? ' on' : '')} onClick={() => setCustom(true)}>{t('Custom')}</button>
    </div>
    {custom && <div className="row cfgrow" style={{ marginTop: 10 }}>
      <Stepper label={t('From')} value={from} step={1} decimal={false} onChange={v => { setFrom(v); onPick(v, Math.max(v, to)) }} />
      <Stepper label={t('To')} value={to} step={1} decimal={false} onChange={v => { setTo(v); onPick(Math.min(from, v), v) }} />
    </div>}
  </>
}

const setsSheet = (cfg, onChange) => ui().openSheet(close => <>
  <h3>{t('Sets')}</h3>
  <SetsChips value={cfg.sets || 1} onPick={n => { onChange({ ...cfg, sets: n }); close() }} />
  <div style={{ height: 12 }} />
</>)

function RepsSheet({ cfg, onChange, close }) {
  const [cur, setCur] = useState(cfg)
  const pick = (lo, hi, done) => { const next = withRepRange(cur, lo, hi); setCur(next); onChange(next); if (done) close() }
  return <>
    <h3>{t('Reps')}</h3>
    {/* a preset closes the sheet; Custom stays open for the steppers, with Done to leave */}
    <RepsChips cfg={cur} onPick={(lo, hi) => pick(lo, hi, REP_CHOICES.some(([a, b]) => a === lo && b === hi))} />
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={close}>{t('Done')}</Button>
  </>
}
const repsSheet = (cfg, onChange) => ui().openSheet(close => <RepsSheet cfg={cfg} onChange={onChange} close={close} />)

function WeightSheet({ cfg, unit, onChange, close }) {
  const bw = isBw(cfg)
  const [w, setW] = useState(cfg.weight || 0)
  return <>
    <h3>{bw ? t('Added weight') : t('Weight')}</h3>
    <div className="row cfgrow"><Stepper value={w} step={2.5} unit={unit} onChange={setW} /></div>
    {bw && <div className="small dim" style={{ marginTop: 8 }}>{t('Leave it at 0 for plain bodyweight.')}</div>}
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={() => { onChange({ ...cfg, weight: Math.max(0, w) }); close() }}>{t('Save')}</Button>
  </>
}
const weightSheet = (cfg, unit, onChange) => ui().openSheet(close => <WeightSheet cfg={cfg} unit={unit} onChange={onChange} close={close} />)

/**
 * "3 sets · 8–12 reps · 60 kg" as three buttons on a routine row. Each opens a small picker
 * and saves straight away; the taps don't reach the row, which still opens the full sheet.
 */
export function SchemePills({ cfg, unit, onChange }) {
  const { lo, hi } = repRangeOf(cfg)
  const bw = isBw(cfg)
  const stop = fn => e => { e.stopPropagation(); fn() }
  return <div className="pills">
    <button className="pill" onClick={stop(() => setsSheet(cfg, onChange))}>{t('{0} sets', cfg.sets || 1)}</button>
    <button className="pill" onClick={stop(() => repsSheet(cfg, onChange))}>{t('{0} reps', repsLabel(lo, hi))}</button>
    <button className="pill" onClick={stop(() => weightSheet(cfg, unit, onChange))}>
      {cfg.weight > 0 ? (bw ? '+' : '') + fmtNum(cfg.weight) + ' ' + unit : bw ? t('Bodyweight') : '0 ' + unit}</button>
  </div>
}
