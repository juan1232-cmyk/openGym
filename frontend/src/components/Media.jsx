import { useState } from 'react'
import { imgSrc, gifSrc } from '../lib/exercises.js'
import Icon from './Icon.jsx'

// Big autoplaying animation; tap toggles to the still frame. Shown where you go to learn the
// movement (Details, configuring an exercise) — the workout card uses Thumb instead, which is
// why the minimize toggle from upstream #12 is gone. No overlay labels: just the movement.
// Custom exercises have no media — the animation stays blank by design (issue #11).
// Media that fails to load (no media service running, a dataset image missing) falls back
// to nothing / the placeholder instead of the browser's broken-image icon. The failure is
// remembered per file, not per component, since a swap reuses the slot for another lift.
export default function Media({ ex, id }) {
  const [playing, setPlaying] = useState(true)
  const [failed, setFailed] = useState(null)
  if (!ex.gif || failed === ex.gif) return null
  return (
    <div className="exmedia" id={id} onClick={() => setPlaying(p => !p)}>
      <img decoding="async" src={playing ? gifSrc(ex) : imgSrc(ex)} alt={ex.n} onError={() => setFailed(ex.gif)} />
    </div>
  )
}

export function Thumb({ ex }) {
  const [failed, setFailed] = useState(null)
  if (!ex.img || failed === ex.img) return <div className="thumb thumb-x"><Icon name="dumbbell" /></div>
  return <img className="thumb" loading="lazy" decoding="async" src={imgSrc(ex)} alt="" onError={() => setFailed(ex.img)} />
}
