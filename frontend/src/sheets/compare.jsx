// The exercise score on screen (layer 1 of the training engine, lib/score.js): the card in an
// exercise's detail sheet, and the side-by-side compare. Both show the A/B/C evidence letter
// next to every rating — most of these numbers are judgement, and the letters say which ones.
import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useRatings } from '../store/useRatings.js'
import { EXIDX } from '../lib/exercises.js'
import { scoreOf, compare, ratedAlternatives, reasonOf, roundScore, scoreboard, shortNames, RATING_NAME, RATING_Q } from '../lib/score.js'
import { EVIDENCE, EVIDENCE_NAME, TARGETS, targetsOf } from '../lib/ratings.js'
import { RATINGS, COMFORT_MIN, SAME_WITHIN, STUDIED_PAIRS } from '../lib/engine-config.js'
import { buildSets } from '../lib/history.js'
import { nextPrescription, applyPrescription } from '../lib/progression.js'
import { t } from '../lib/i18n.js'
import Stepper from '../components/Stepper.jsx'
import Icon from '../components/Icon.jsx'
import { update, ui, toast } from './common.jsx'

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
      {alts.length > 0 && <CompareCue ex={ex} s={s} best={alts[0]} count={alts.length} />}
    </div>
  </>
}

// The way into the head-to-head: a black card naming the best alternative when one scores
// higher (black marks the answer), or saying this is the top pick when nothing does.
function CompareCue({ ex, s, best, count }) {
  const better = round(best.score) > round(s.score)
  return <button className="cmp-cue" onClick={() => compareSheet(ex.id, s.muscle, better ? best.id : undefined)}>
    <span className="grow">
      {/* only the name is capitalised: the dataset writes names in lower case, sentences aren't */}
      <b>{better ? <><span className="capitalize">{(EXIDX[best.id] || {}).n || best.id}</span> {t('scores {0}', round(best.score))}</>
        : t('Top pick for {0}', targetName(s.muscle).toLowerCase())}</b>
      <small>{better ? t(reasonOf(best)) : t('Best of {0} rated exercises', count + 1)}</small>
    </span>
    <span className="cmp-cue-go">{t('Compare')}</span>
  </button>
}

// The best-scoring alternative that a study set against this exercise, if there is one.
function counterpart(a, alts) {
  const pair = STUDIED_PAIRS.find(p => p.includes(a.studied))
  const other = pair && pair.find(x => x !== a.studied)
  return other ? alts.find(x => x.studied === other) : undefined
}

// The scoreboard's names: cost is shown flipped (10 − C), so it reads as what it measures for
// you, and the limiter as the plain question it answers.
const BOARD_NAME = { S: 'Stretch', L: 'Fails first', St: 'Stable', P: 'Easy to load', T: 'Strength', C: 'Easy on body' }

// The hexagon: six axes clockwise from the top, 0 at the centre and 10 at the rim, cost flipped
// like the scoreboard so further out is better on every corner.
const HEX = ['S', 'L', 'St', 'P', 'T', 'C']
const HEX_C = 120, HEX_R = 90
const hexPoint = (i, v) => {
  const a = (-90 + 60 * i) * Math.PI / 180
  return (HEX_C + HEX_R * v / 10 * Math.cos(a)).toFixed(1) + ',' + (HEX_C + HEX_R * v / 10 * Math.sin(a)).toFixed(1)
}
const hexOf = r => HEX.map((k, i) => hexPoint(i, k === 'C' ? 10 - r[k] : r[k])).join(' ')
const ring = v => HEX.map((_, i) => hexPoint(i, v)).join(' ')
const HEX_LABEL = [[120, 16, 'middle'], [204, 70, 'start'], [204, 180, 'start'], [120, 232, 'middle'], [36, 180, 'end'], [36, 70, 'end']]

// Where swapping a for b would land: the live workout if a is in it and not started (the rule
// the workout's own Swap keeps — once a set is ticked, changing the exercise rewrites history),
// else every routine that plans a.
function swapTargets(st, aId) {
  const live = (st.active?.entries || []).findIndex(e => e.id === aId && !e.sets.some(s => s.done))
  if (live >= 0) return { live }
  const routines = (st.routines || []).filter(r => (r.ex || []).some(e => e.id === aId))
  return routines.length ? { routines } : null
}

function doSwap(aId, bId) {
  update(s => {
    const where = swapTargets(s, aId)
    if (!where) return
    if (where.live != null) {
      const e = s.active.entries[where.live]
      const { weight, bodyweight, ...keep } = e.target || {}
      const cfg = { ...keep, id: bId, weight: 0 }
      const plan = nextPrescription(s, cfg, s.routines.find(r => r.id === s.active.routineId))
      s.active.entries[where.live] = { id: bId, target: { ...cfg }, plan, sets: applyPrescription(buildSets(s, cfg), plan), sg: e.sg }
      return
    }
    // the same move the routine editor's Swap makes: keep the scheme, start the new lift from 0
    s.routines.forEach(r => r.ex.forEach((e, i) => { if (e.id === aId) r.ex[i] = { ...e, id: bId, weight: 0 } }))
  })
}

// The head-to-head (design E on the compare canvas): the verdict first, the two shapes on one
// hexagon as the picture, the scoreboard as the numbers, then one decision in the dock.
export function Compare({ aId, muscle, initial, close }) {
  useRatings()
  const st = useStore(s => s.S)
  const comfort = st.comfort || {}
  const [q, setQ] = useState('')
  const name = id => (EXIDX[id] || {}).n || id
  const all = ratedAlternatives(aId, comfort, muscle)
  const a0 = scoreOf(aId, undefined, muscle)
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const hits = all.filter(x => words.every(w => name(x.id).toLowerCase().includes(w)))
  const pin = !words.length && a0 && counterpart(a0, all)
  const alts = (pin ? [pin, ...hits.filter(x => x !== pin)] : hits).slice(0, MAX_ALTS)
  const [bId, setB] = useState(initial || (pin ? pin.id : all[0] && all[0].id))
  const c = bId && compare(aId, bId, comfort, muscle)
  if (!c) return <><h3>{t('Compare')}</h3><div className="muted">{t('No other rated exercise for this muscle yet.')}</div></>

  const [na, nb] = shortNames(name(aId), name(bId))
  const short = { a: na, b: nb }
  const rows = scoreboard(c)
  const lead = c.win || 'a'                 // whose shape is drawn solid: the winner, or a on a tie
  const other = lead === 'a' ? 'b' : 'a'
  const where = swapTargets(st, aId)
  const verdictSub = !c.win ? t('Scores within {0} points of each other', SAME_WITHIN)
    : c.studied ? t('Studies measured this one directly')
    : c.why ? t('Decided by {0}, worth {1} points', t(BOARD_NAME[c.why.k]).toLowerCase(), round(c.why.drop))
    : t('Higher score overall')
  const note = r => !r.win ? t('Even')
    : t('{0} by {1}', short[r.win], r.gap) + (r.decisive ? ' · ' + t('decides it') : r.small ? ' · ' + t('small') : '')
  return <div className="cmp">
    <h3>{t('Compare')}</h3>
    <div className="muted small cmp-sub">{t('Two {0} exercises, side by side', targetName(c.muscle).toLowerCase())}</div>
    <input className="input" type="search" placeholder={t('Search')} value={q} onChange={e => setQ(e.target.value)} />
    <div className="chips cmp-alts">
      {alts.length === 0 && <span className="muted small">{t('No match')}</span>}
      {alts.map(x => <button key={x.id} className={'chip capitalize' + (x.id === bId ? ' on' : '')} onClick={() => setB(x.id)}>{name(x.id)}</button>)}
    </div>

    <div className="cmp-verdict">
      <div>
        <b className="cmp-verdict-t">{c.win ? t('{0} wins', short[c.win]) : t('About the same')}</b>
        <span>{verdictSub}</span>
      </div>
      <div className="cmp-verdict-n"><b>{round(c[lead].score)}</b><span>{t('vs {0}', round(c[other].score))}</span></div>
    </div>

    <div className="cmp-hex">
      <div className="cmp-legend">
        <span className="capitalize"><i className="solid" />{short[lead]}</span>
        <span className="capitalize"><i className="dashed" />{short[other]}</span>
      </div>
      <svg viewBox="-45 0 330 240" role="img" aria-label={HEX.map(k => t(BOARD_NAME[k]) + ' ' + rows.find(r => r.k === k)[lead] + ' / ' + rows.find(r => r.k === k)[other]).join(', ')}>
        <polygon points={ring(10)} className="grid" />
        <polygon points={ring(5)} className="grid" />
        <polygon points={hexOf(c[other])} className="other" />
        <polygon points={hexOf(c[lead])} className="lead" />
        {HEX.map((k, i) => <text key={k} x={HEX_LABEL[i][0]} y={HEX_LABEL[i][1]} textAnchor={HEX_LABEL[i][2]}>{t(BOARD_NAME[k])}</text>)}
      </svg>
    </div>

    <div className="cmp-board">
      <div className="cmp-row hd"><span>{t('Ordered by how much it counts')}</span><span className="capitalize">{na}</span><span className="capitalize">{nb}</span></div>
      {rows.map(r => <div key={r.k} className="cmp-row" title={t(RATING_Q[r.k])}>
        <span className="cmp-label">
          <b>{t(BOARD_NAME[r.k])} <Ev k={r.k} /></b>
          <small className={r.decisive ? 'key' : ''}>{note(r)}</small>
        </span>
        <span className={'cmp-pill' + (r.win === 'a' ? ' win' : '')}>{r.a}</span>
        <span className={'cmp-pill' + (r.win === 'b' ? ' win' : '')}>{r.b}</span>
      </div>)}
    </div>

    <div className="cmp-dock">
      <div className="grow">
        <span>{where ? (where.live != null ? t('Swap in this workout') : t('Swap in {0}', where.routines.length === 1 ? where.routines[0].name : t('{0} routines', where.routines.length))) : t('Not in your plan')}</span>
        <b className="capitalize">{name(bId)}</b>
      </div>
      <button className="cmp-keep" onClick={close}>{where ? t('Keep') : t('Close')}</button>
      {where && <button className="cmp-swap" onClick={() => { doSwap(aId, bId); close(); toast(t('Swapped for {0}', name(bId))) }}><Icon name="swap" />{t('Swap')}</button>}
    </div>
  </div>
}
export const compareSheet = (aId, muscle, initial) => ui().openSheet(close => <Compare aId={aId} muscle={muscle} initial={initial} close={close} />)
