import { useState } from 'react'
import { imgSrc, gifSrc } from '../lib/exercises.js'
import Icon from './Icon.jsx'

// Big autoplaying animation; tap toggles to the still frame. Shown where you go to learn the
// movement (Details, configuring an exercise) — the workout card uses Thumb instead, which is
// why the minimize toggle from upstream #12 is gone. No overlay labels: just the movement.
// Custom exercises have no media — the animation stays blank by design (issue #11).
export default function Media({ ex, id }) {
  const [playing, setPlaying] = useState(true)
  if (!ex.gif) return null
  return (
    <div className="exmedia" id={id} onClick={() => setPlaying(p => !p)}>
      <img decoding="async" src={playing ? gifSrc(ex) : imgSrc(ex)} alt={ex.n} />
    </div>
  )
}

export function Thumb({ ex }) {
  if (!ex.img) return <div className="thumb thumb-x"><Icon name="dumbbell" /></div>
  return <img className="thumb" loading="lazy" decoding="async" src={imgSrc(ex)} alt="" />
}
