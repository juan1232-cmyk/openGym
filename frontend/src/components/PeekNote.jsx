import { useEffect, useState } from 'react'
import Orb from './Orb.jsx'
import PeekSay from './PeekSay.jsx'
import { sayNow } from '../store/peek.js'
import { t } from '../lib/i18n.js'

// Peek outside its own skin: the Peek screens are a light stone page, but Stats, History and
// Plan still follow the profile's theme — on a dark one the black orb would vanish into the
// page, so it turns light there.
const onDark = () => {
  const de = document.documentElement
  if (de.dataset.skin === 'peek') return false
  return de.dataset.theme !== 'light'
}

// A one-line remark in a card, orb beside it (Stats).
export function PeekNote({ line, mood = 'idle' }) {
  if (!line) return null
  return <div className="card pk-note">
    <Orb size={44} mood={mood} inverted={onDark()} />
    <p>{line}</p>
  </div>
}

// An empty screen with Peek in it: the orb, what it thinks about the emptiness (when its
// voice is on), and the plain instruction underneath either way.
export function PeekEmpty({ situation, mood = 'curious', hint }) {
  // picked after render: saying a line writes it into Peek's memory, which is a store update
  const [line, setLine] = useState(null)
  useEffect(() => { setLine(sayNow(situation)) }, [situation])
  return <div className="pk-empty">
    <Orb size={72} mood={mood} inverted={onDark()} />
    <PeekSay line={line} delay={400} className="up" />
    {hint && <div className="hint">{t(hint)}</div>}
  </div>
}
