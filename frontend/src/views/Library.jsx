import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { EXDB, allExercises, equipmentOf } from '../lib/exercises.js'
import { searchExercises, usageOf, muscleChips, matchesMuscle } from '../lib/pick.js'
import { bestWeightFor } from '../lib/history.js'
import { fmtNum } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { Thumb } from '../components/Media.jsx'
import { exerciseDetailSheet, addToRoutineSheet, customExSheet, muscleLine, chipLabel } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'

export default function Library() {
  const S = useStore(s => s.S)
  const [q, setQ] = useState('')
  const [mu, setMu] = useState('')
  const [eq, setEq] = useState('')
  const [shown, setShown] = useState(40)
  const all = allExercises(S)
  const base = searchExercises(all.filter(e => matchesMuscle(e, mu)), q, { usage: usageOf(S) })
  const eqOpts = equipmentOf(base)
  // Drop the equipment filter if the search narrowed it away, so you never hit a dead end.
  const eqOn = eqOpts.includes(eq) ? eq : ''
  const f = eqOn ? base.filter(e => e.eq === eqOn) : base

  return <>
    <div className="hdr"><div><h1>{t('Exercises')}</h1><div className="sub">{t('{0} exercises with animations', EXDB.length)}</div></div></div>
    <div className="search" style={{ marginBottom: 10 }}><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
      <input className="input" placeholder={t('Search…')} value={q} onChange={e => { setQ(e.target.value); setShown(40) }} /></div>
    <div className="chips" style={{ marginBottom: eqOpts.length > 1 ? 8 : 12 }}>
      <button className={'chip nocap' + (!mu ? ' on' : '')} onClick={() => { setMu(''); setEq(''); setShown(40) }}>{t('All')}</button>
      {muscleChips(all).map(m => <button key={m} className={'chip' + (mu === m ? ' on' : '')} onClick={() => { setMu(m); setEq(''); setShown(40) }}>{chipLabel(m)}</button>)}
    </div>
    {eqOpts.length > 1 && <div className="chips" style={{ marginBottom: 12 }}>
      <button className={'chip nocap' + (!eqOn ? ' on' : '')} onClick={() => { setEq(''); setShown(40) }}>{t('Any equipment')}</button>
      {eqOpts.map(x => <button key={x} className={'chip' + (eqOn === x ? ' on' : '')} onClick={() => { setEq(x); setShown(40) }}>{t(x)}</button>)}
    </div>}
    <div className="list">
      <div className="item" onClick={() => customExSheet(null, ex => exerciseDetailSheet(ex), q.trim())}>
        <div className="thumb thumb-x"><Icon name="sparkles" /></div>
        <div className="grow"><div className="tt">{t('Create your own exercise')}</div><div className="ss">{t('name + body part, no animation')}</div></div><Icon name="plus" className="chev" />
      </div>
      {f.slice(0, shown).map(e => {
        const best = bestWeightFor(S, e.id)
        return <div key={e.id} className="item" onClick={() => exerciseDetailSheet(e)}>
          <Thumb ex={e} />
          <div className="grow"><div className="tt capitalize">{e.n}</div><div className="ss">{muscleLine(e)}</div></div>
          {best > 0 && <span className="tag acc">{fmtNum(best)}</span>}
          <Button size="sm" variant="tinted" icon="plus" onClick={ev => { ev.stopPropagation(); addToRoutineSheet(e) }}>{t('Plan')}</Button>
        </div>
      })}
      {f.length === 0 && <div className="empty"><div className="ico"><Icon name="magnifier" /></div>{t('No match')}</div>}
    </div>
    {f.length > shown && <><div style={{ height: 10 }} /><Button onClick={() => setShown(s => s + 40)}>{t('Show more')}</Button></>}
  </>
}
