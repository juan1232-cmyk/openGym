import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { starterPlan, DAY_OPTIONS } from '../lib/starter.js'
import { t } from '../lib/i18n.js'
import Orb from '../components/Orb.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'

// The design's subtitles, except "Lose fat": it promised "strength plus conditioning", and
// the plan it gets is the same lifts with shorter rest — the line says what actually happens.
const GOAL_INFO = [
  ['muscle', 'Build muscle', 'Hypertrophy-focused sessions'],
  ['strength', 'Get stronger', 'Heavier lifts, lower reps'],
  ['fat', 'Lose fat', 'Denser sessions, shorter rest'],
  ['consistent', 'Stay consistent', 'Short sessions, steady habit']
]

// D5 — goals. Shown once to a profile with nothing planned and nothing logged (see needsGoals
// in the store), in place of Home's old "load the starter plan" card: the two answers pick
// the starter plan's split and schedule (lib/starter.js starterPlan). Skipping records 'own'
// so it never comes back, and drops you on Plan to build one by hand.
export default function Goals() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const update = useStore(s => s.update)
  const [goal, setGoal] = useState('muscle')
  const [days, setDays] = useState(3)
  const orb = useRef(null)
  const pick = g => { setGoal(g); orb.current?.react('small-attentive', 700) }

  const finish = () => {
    const plan = starterPlan({ goal, days })
    update(s => {
      s.routines.push(...plan.routines)
      Object.assign(s.week, plan.week)
      s.goal = goal; s.days = days
      if (plan.restSec) s.restSec = plan.restSec
    })
    useUI.getState().toast(t('Your plan is ready — {0} days a week', days))
    nav('/home')
  }
  const skip = () => { update(s => { s.goal = 'own' }); nav('/plan') }

  return (
    <div className="pk-full pk-goals">
      {/* the step count only means something to someone who just came through "create account" */}
      <div className="pk-nav"><span />{user && <span className="steps">{t('{0} of {1}', 2, 2)}</span>}</div>
      <div className="pk-ask">
        <Orb ref={orb} size={64} poke="joyful-wide" />
        <h1>{t('What are we training for?')}</h1>
      </div>
      <div className="pk-choices" role="radiogroup" aria-label={t('Goal')}>
        {GOAL_INFO.map(([k, name, sub]) => (
          <button key={k} role="radio" aria-checked={goal === k} className={'pk-choice' + (goal === k ? ' on' : '')} onClick={() => pick(k)}>
            <span className="txt"><b>{t(name)}</b><span>{t(sub)}</span></span>
            <span className="tick">{goal === k && <Icon name="check" />}</span>
          </button>
        ))}
      </div>
      <div className="pk-label">{t('Days per week')}</div>
      <div className="pk-seg" role="radiogroup" aria-label={t('Days per week')}>
        {DAY_OPTIONS.map(n => (
          <button key={n} role="radio" aria-checked={days === n} className={days === n ? 'on' : ''} onClick={() => setDays(n)}>{n}</button>
        ))}
      </div>
      <div className="grow" />
      <div className="pk-actions">
        <Button variant="primary" onClick={finish}>{t('Continue')}</Button>
        <button className="pk-link" onClick={skip}>{t("I'll build my own plan")}</button>
      </div>
    </div>
  )
}
