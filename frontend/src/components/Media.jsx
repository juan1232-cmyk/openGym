import { useEffect, useState } from 'react'
import { imgSrc, gifSrc, poseSrc } from '../lib/exercises.js'
import Icon from './Icon.jsx'

// How long each pose shows before the other one takes its place — the pace picked side by
// side against faster and slower ones.
const POSE_MS = 1200
const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

// The exercise, shown where you go to learn the movement (Details, configuring an exercise) —
// the workout card uses Thumb instead, which is why the minimize toggle from upstream #12 is
// gone. No overlay labels: just the movement. Tap pauses it.
// Custom exercises have no media — the slot stays blank by design (issue #11).
//
// It switches between the GIF's two held positions, upscaled to 720px
// (scripts/upscale-poses.sh): the GIFs are 180px and soft when stretched to this size, and
// their in-between frames carry motion trails, so two sharp poses read better than the full
// rep. An exercise without upscaled poses — the script runs on a desktop and may not have
// reached it, and a plain `npm run dev` may never have run it — plays its GIF instead. Media
// that fails to load either way falls back to nothing instead of the browser's broken-image
// icon. Failures are remembered per file, not per component, since a swap reuses the slot
// for another lift.
export default function Media({ ex, id }) {
  const [playing, setPlaying] = useState(() => !reduceMotion())
  const [second, setSecond] = useState(false)
  const [failed, setFailed] = useState(null)
  const [noPose, setNoPose] = useState(null)
  const poses = !!ex.gif && noPose !== ex.gif
  useEffect(() => {
    if (!poses || !playing) return
    const t = setInterval(() => setSecond(s => !s), POSE_MS)
    return () => clearInterval(t)
  }, [poses, playing, ex.gif])
  if (!ex.gif || failed === ex.gif) return null
  if (poses) {
    // both stay mounted, the second stacked on the first, so a switch never waits on a load
    return (
      <div className="exmedia expose" id={id} onClick={() => setPlaying(p => !p)}>
        <img decoding="async" src={poseSrc(ex, 1)} alt={ex.n} onError={() => setNoPose(ex.gif)} />
        <img decoding="async" src={poseSrc(ex, 2)} alt="" style={{ visibility: second ? 'visible' : 'hidden' }} onError={() => setNoPose(ex.gif)} />
      </div>
    )
  }
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
