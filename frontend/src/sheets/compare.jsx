// The exercise score on screen (layer 1 of the training engine, lib/score.js): the card in an
// exercise's detail sheet, and the side-by-side compare. Both show the A/B/C evidence letter
// next to every rating — most of these numbers are judgement, and the letters say which ones.
import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useRatings } from '../store/useRatings.js'
import { EXIDX } from '../lib/exercises.js'
import { scoreOf, compare, ratedAlternatives, reasonOf, roundScore, RATING_NAME, RATING_Q } from '../lib/score.js'
import { EVIDENCE, EVIDENCE_NAME, TARGETS, targetsOf } from '../lib/ratings.js'
import { RATINGS, COMFORT_MIN, SAME_WITHIN, STUDIED_PAIRS } from '../lib/engine-config.js'
import { t } from '../lib/i18n.js'
import Stepper from '../components/Stepper.jsx'
import { Button } from '../components/ui.jsx'
import { update, ui } from './common.jsx'

const round = roundScore
const targetName = m => t((TARGETS[m] || { name: m }).name)
const Ev = ({ k }) => <span className={'sc-ev ev-' + EVIDENCE[k]} title={t(EVIDENCE_NAME[EVIDENCE[k]])}>{EVIDENCE[k]}</span>

// How many alternatives the compare sheet offers as chips: there are ~130 for chest, and a row
// that long can't be scrolled. Best scores first, the studied counterpart of this exercise
// (the other half of a STUDIED_PAIRS pair) pinned in front, and a search for everything else.
const MAX_ALTS = 12

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
  useRatings()
  const comfort = useStore(s => s.S.comfort || {})
  const [pick, setPick] = useState(null)
  const targets = targetsOf(ex.id)
  // Rated for several muscles (a pull-up: lats and biceps): one score each, the main one first.
  const m = targets.includes(pick) ? pick : targets[0]
  const s = scoreOf(ex.id, comfort[ex.id], m)
  if (!s) return null
  const alts = ratedAlternatives(ex.id, comfort, m)
  return <>
    <h4 className="sec">{t('Peek score')}</h4>
    <div className="sc-card">
      {targets.length > 1 && <div className="chips" style={{ marginBottom: 10 }}>
        {targets.map(x => <button key={x} className={'chip' + (x === m ? ' on' : '')} onClick={() => setPick(x)}>{targetName(x)}</button>)}
      </div>}
      <div className="sc-top">
        <b className="sc-n">{round(s.score)}</b>
        <div className="grow">
          <div className="tt">{t('for {0}', targetName(s.muscle))}</div>
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
      {alts.length > 0 && <Button variant="soft" icon="shuffle" style={{ marginTop: 12 }} onClick={() => compareSheet(ex.id, m)}>
        {t('Compare with {0} more', alts.length)}</Button>}
    </div>
  </>
}

// The best-scoring alternative that a study set against this exercise, if there is one.
function counterpart(a, alts) {
  const pair = STUDIED_PAIRS.find(p => p.includes(a.studied))
  const other = pair && pair.find(x => x !== a.studied)
  return other ? alts.find(x => x.studied === other) : undefined
}

function Compare({ aId, muscle }) {
  useRatings()
  const comfort = useStore(s => s.S.comfort || {})
  const [q, setQ] = useState('')
  const name = id => (EXIDX[id] || {}).n || id
  const all = ratedAlternatives(aId, comfort, muscle)
  const a0 = scoreOf(aId, undefined, muscle)
  const words = q.toLowerCase().split(/s+/).filter(Boolean)
  const hits = all.filter(x => words.every(w => name(x.id).toLowerCase().includes(w)))
  const pin = !words.length && a0 && counterpart(a0, all)
  const alts = (pin ? [pin, ...hits.filter(x => x !== pin)] : hits).slice(0, MAX_ALTS)
  const [bId, setB] = useState(pin ? pin.id : all[0] && all[0].id)
  const c = bId && compare(aId, bId, comfort, muscle)
  if (!c) return <><h3>{t('Compare')}</h3><div className="muted">{t('No other rated exercise for this muscle yet.')}</div></>
  const cell = (side, v, win) => <b className={win === side ? 'win' : ''}>{v}</b>
  const winId = c.win && (c.win === 'a' ? aId : bId)
  return <>
    <h3>{t('Compare')}</h3>
    <div className="muted small" style={{ marginBottom: 10 }}>{t('Against another exercise for {0}', targetName(c.muscle))}</div>
    <input className="input" type="search" placeholder={t('Search')} value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 8 }} />
    <div className="chips" style={{ marginBottom: 12 }}>
      {alts.length === 0 && <span className="muted small">{t('No match')}</span>}
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
    {!c.win && <div className="sc-gap">{t('About the same: the scores are within {0} points.', SAME_WITHIN)}</div>}
    {c.studied && <div className="sc-gap">{t('Studies favour {0}.', name(winId))}</div>}
    {c.why && <div className="sc-gap">{t('{0} wins on {1}: {2} vs {3}',
      name(winId), t(RATING_NAME[c.why.k]).toLowerCase(), c.why.from, c.why.to)}</div>}
    {c.win && !c.why && !c.studied && <div className="sc-gap">{t('{0} scores higher.', name(winId))}</div>}
    <div className="small dim" style={{ margin: '4px 0 14px' }}>{t('Cost: lower wins. The score leans 75 % on muscle growth, 25 % on strength.')}</div>
    <Comfort id={aId} label={t('Comfort: {0}', name(aId))} />
    <Comfort id={bId} label={t('Comfort: {0}', name(bId))} />
  </>
}
export const compareSheet = (aId, muscle) => ui().openSheet(() => <Compare aId={aId} muscle={muscle} />)
