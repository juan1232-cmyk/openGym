import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'

// The pill that pops up over the set list right after you tick one off — "Set logged" plus
// the value that got logged. Kept out of the app's shared #toast (Toast.jsx) on purpose: that
// one is a plain translucent line used for unrelated messages everywhere, while this is the
// mock's own fully-inverted treatment and only ever appears here. Workout.jsx clears the text
// after ~1.7s, which is what actually removes this from the tree — the animation's duration is
// tuned to match that exactly, so it is always mid-fade-out rather than cut off.
export default function SetToast({ text }) {
  return (
    <div className="settoast">
      <span className="stk"><Icon name="check" /></span>
      <b>{t('Set logged')}</b>
      <span className="v">{text}</span>
    </div>
  )
}
