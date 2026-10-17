// The exercise score on screen (layer 1 of the training engine, lib/score.js): the card in an
// exercise's detail sheet, and the side-by-side compare. Both show the A/B/C evidence letter
// next to every rating — most of these numbers are judgement, and the letters say which ones.
import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { EXIDX } from '../lib/exercises.js'
import { MUSCLE_NAME } from '../lib/muscles.js'
import { scoreOf, compare, ratedAlternatives, reasonOf, RATING_NAME, RATING_Q } from '../lib/score.js'
import { EVIDENCE, EVIDENCE_NAME } from '../lib/ratings.js'
import { RATINGS, COMFORT_MIN } from '../lib/engine-config.js'
import { t } from '../lib/i18n.js'
import Stepper from '../components/Stepper.jsx'
import { Button } from '../components/ui.jsx'
import { update, ui } from './common.jsx'

const round = v => Math.round(v)
const Ev = ({ k }) => <span className={'sc-ev ev-' + EVIDENCE[k]} title={t(EVIDENCE_NAME[EVIDENCE[k]])}>{EVIDENCE[k]}</span>

// How a joint feels doing this, 0–10. Unset reads as 10 — no complaint — and setting it back to
// 10 drops the key, so S.comfort only ever holds the exercises someone actually flagged.
function Comfort({ id, label }) {
  const c = useStore(s => (s.S.comfort || {})[id])
  const set = v => update(s => {
    const n = Math.min(10, Math.max(0, Math.round(+v || 0)))
    s.comfort = s.comfort || {}
    if (n >= 10) delete s.comfort[id]; else s.comfort[id] = n
  })
  return <div className="sc-comfort">
    <Stepper label={label || t('Joint comfort')} value={c ?? 10} step={1} decimal={false} onChange={set} />
    <div className="small dim">{c != null && c < COMFORT_MIN
      ? t('Under {0}: the score drops 20 %. An exercise that hurts is a bad one for you.', COMFORT_MIN)
      : t('10 = no discomfort. Under {0} takes 20 % off the score.', COMFORT_MIN)}</div>
  </div>
}

/** The score section of an exercise's detail sheet — nothing at all for an unrated exercise. */
export function ScoreCard({ ex }) {
  const comfort = useStore(s => s.S.comfort || {})
  const s = scoreOf(ex.id, comfort[ex.id])
  if (!s) return null
  const alts = ratedAlternatives(ex.id, comfort)
  return <>
    <h4 className="sec">{t('Peek score')}</h4>
    <div className="sc-card">
      <div className="sc-top">
        <b className="sc-n">{round(s.score)}</b>
        <div className="grow">
          <div className="tt">{t('for {0}', t(MUSCLE_NAME[s.muscle]))}</div>
          <div className="small dim">{s.sore ? t('Hurts your joints') : t(reasonOf(s))}</div>
        </div>
      </div>
      <div className="sc-sub small dim">
        {t('Muscle {0} · after tiredness {1} · strength {2}', round(s.H), round(s.Heff), round(s.Str))}
      </div>
      {RATINGS.map(k => <div key={k} className="sc-row" title={t(RATING_Q[k])}>
        <span>{t(RATING_NAME[k])}</span>
        <i className={k === 'C' ? 'cost' : ''} style={{ '--v': s[k] / 10 }} />
        <b>{s[k]}</b><Ev k={k} />
      </div>)}
      <div className="small dim sc-legend">{t('A strong studies · B some direct studies · C reasoning only. Cost: higher is worse.')}</div>
      <Comfort id={ex.id} />
      {alts.length > 0 && <Button variant="soft" icon="shuffle" style={{ marginTop: 12 }} onClick={() => compareSheet(ex.id)}>
        {t('Compare with {0} more', alts.length)}</Button>}
    </div>
  </>
}

function Compare({ aId }) {
  const comfort = useStore(s => s.S.comfort || {})
  const alts = ratedAlternatives(aId, comfort)
  const [bId, setB] = useState(alts[0] && alts[0].id)
  const c = bId && compare(aId, bId, comfort)
  const name = id => (EXIDX[id] || {}).n || id
  if (!c) return <><h3>{t('Compare')}</h3><div className="muted">{t('No other rated exercise for this muscle yet.')}</div></>
  const cell = (side, v, win) => <b className={win === side ? 'win' : ''}>{v}</b>
  return <>
    <h3>{t('Compare')}</h3>
    <div className="muted small" style={{ marginBottom: 10 }}>{t('Against another exercise for {0}', t(MUSCLE_NAME[c.a.muscle]))}</div>
    <div className="chips" style={{ marginBottom: 12 }}>
      {alts.map(x => <button key={x.id} className={'chip capitalize' + (x.id === bId ? ' on' : '')} onClick={() => setB(x.id)}>{name(x.id)}</button>)}
    </div>
    <div className="sc-cmp">
      <span /><span className="capitalize">{name(aId)}</span><span className="capitalize">{name(bId)}</span>
      <span className="sc-total">{t('Score')}</span>{cell('a', round(c.a.score), c.win)}{cell('b', round(c.b.score), c.win)}
      {c.rows.map(r => [
        <span key={r.k}>{t(RATING_NAME[r.k])} <Ev k={r.k} /></span>,
        <span key={r.k + 'a'}>{cell('a', r.a, r.win)}</span>,
        <span key={r.k + 'b'}>{cell('b', r.b, r.win)}</span>
      ])}
    </div>
    {c.gap && <div className="sc-gap">{t('{0} wins on {1}: {2} vs {3}',
      name(c.gap.win === 'a' ? aId : bId), t(RATING_NAME[c.gap.k]).toLowerCase(),
      c.gap.win === 'a' ? c.gap.a : c.gap.b, c.gap.win === 'a' ? c.gap.b : c.gap.a)}</div>}
    <div className="small dim" style={{ margin: '4px 0 14px' }}>{t('Cost: lower wins. The score leans 75 % on muscle growth, 25 % on strength.')}</div>
    <Comfort id={aId} label={t('Comfort: {0}', name(aId))} />
    <Comfort id={bId} label={t('Comfort: {0}', name(bId))} />
  </>
}
export const compareSheet = aId => ui().openSheet(() => <Compare aId={aId} />)
