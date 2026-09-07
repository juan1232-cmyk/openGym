import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'

// The strip that rides on top of the on-screen keyboard while a set field is being typed.
// It carries what the set rows gave up when the +/- steppers came out of them — the step
// buttons and last session's value — plus a way to put the keyboard away, which iOS itself
// does not offer for a decimal pad (it has no return key).
//
// Every press has to leave the input focused: a blur closes the keyboard, and this bar goes
// down with it before the click it was handling ever lands. preventDefault on pointerdown
// stops the focus moving in the first place; the caller re-focuses the field afterwards as
// well, because Safari has historically leaked a blur through on the first touch of a
// freshly-mounted node.
const hold = e => e.preventDefault()

export default function KeyBar({ label, prev, onStep, onPrev, onDone }) {
  return (
    <div className="keybar" onPointerDown={hold} onMouseDown={hold}>
      <span className="kb-l">{label}</span>
      {prev != null && <button className="kb-b prev" onClick={onPrev}>
        {t('Prev')}<b>{prev}</b>
      </button>}
      <span className="kb-sp" />
      <button className="kb-b" aria-label={t('Decrease')} onClick={() => onStep(-1)}><Icon name="minus" /></button>
      <button className="kb-b" aria-label={t('Increase')} onClick={() => onStep(1)}><Icon name="plus" /></button>
      <button className="kb-b done" onClick={onDone}>{t('Done')}</button>
    </div>
  )
}
