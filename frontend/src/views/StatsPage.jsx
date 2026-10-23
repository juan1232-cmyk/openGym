import { useSearchParams } from 'react-router-dom'
import { t } from '../lib/i18n.js'
import { Segmented } from '../components/ui.jsx'
import Stats from './Stats.jsx'
import StatsActions from './StatsActions.jsx'

// The two versions of Stats: the numbers behind the workouts (design A), and what to do about
// the week (actions). Which one is in the address (?design=numbers), so either can be linked to
// and neither is remembered behind the person's back; the actions are what opens.
const DESIGNS = [{ value: 'actions', label: 'Actions' }, { value: 'numbers', label: 'Numbers' }]

export default function StatsPage() {
  const [params, setParams] = useSearchParams()
  const design = params.get('design') === 'numbers' ? 'numbers' : 'actions'
  const switcher = <Segmented className="seg-design" value={design}
    onChange={v => setParams(v === 'actions' ? {} : { design: v }, { replace: true })}
    options={DESIGNS.map(d => ({ value: d.value, label: t(d.label) }))} />
  return design === 'numbers' ? <Stats switcher={switcher} /> : <StatsActions switcher={switcher} />
}
