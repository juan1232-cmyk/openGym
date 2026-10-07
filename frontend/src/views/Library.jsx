import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { allExercises } from '../lib/exercises.js'
import { searchExercises, browseOrder, usageOf, recentIds, muscleChips, matchesMuscle } from '../lib/pick.js'
import { t } from '../lib/i18n.js'
import { Thumb } from '../components/Media.jsx'
import { exerciseDetailSheet, customExSheet, muscleLine, chipLabel } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'

// The same bare layout as the exercise picker: search, one row of muscles, the list —
// what you train first, then the staple lifts. Tapping a row opens the exercise.
export default function Library() {
  const S = useStore(s => s.S)
  const [q, setQ] = useState('')
  const [mu, setMu] = useState('')
  const [shown, setShown] = useState(40)
  const all = allExercises(S)
  const pool = all.filter(e => matchesMuscle(e, mu))
  const f = q.trim() ? searchExercises(pool, q, { usage: usageOf(S) }) : browseOrder(pool, { recent: recentIds(S) })

  return <>
    <div className="hdr"><div><h1>{t('Exercises')}</h1></div></div>
    <div className="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
      <input className="input" placeholder={t('Search')} value={q} onChange={e => { setQ(e.target.value); setShown(40) }} />
      {q && <button className="search-x" aria-label={t('Clear')} onClick={() => { setQ(''); setShown(40) }}><Icon name="xmark" /></button>}</div>
    <div className="chips" style={{ margin: '12px 0 14px' }}>
      <button className={'chip nocap' + (!mu ? ' on' : '')} onClick={() => { setMu(''); setShown(40) }}>{t('All')}</button>
      {muscleChips(all).map(m => <button key={m} className={'chip' + (mu === m ? ' on' : '')} onClick={() => { setMu(m); setShown(40) }}>{chipLabel(m)}</button>)}
    </div>
    <div className="list">
      {f.slice(0, shown).map(e => <div key={e.id} className="item" onClick={() => exerciseDetailSheet(e)}>
        <Thumb ex={e} />
        <div className="grow"><div className="tt capitalize">{e.n}</div><div className="ss">{muscleLine(e)}</div></div>
        <Icon name="chevronRight" className="chev" />
      </div>)}
      {f.length === 0 && <div className="empty">{t('No match')}</div>}
      <div className="item" onClick={() => customExSheet(null, ex => exerciseDetailSheet(ex), q.trim())}>
        <div className="thumb thumb-x"><Icon name="plus" /></div>
        <div className="grow"><div className="tt">{q.trim() ? t('Create “{0}”', q.trim()) : t('Create your own exercise')}</div></div>
      </div>
    </div>
    {f.length > shown && <><div style={{ height: 10 }} /><Button variant="soft" onClick={() => setShown(s => s + 40)}>{t('Show more')}</Button></>}
  </>
}
