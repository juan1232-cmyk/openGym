// A sparkline: the shape of a series and nothing else — no axes, no tooltip. LineChart is
// for reading values off a curve; this is for a tile that already prints its number.
//
// The svg stretches to its box (preserveAspectRatio none) with non-scaling strokes, so the
// line stays crisp at any width. The end dot is an html element on top rather than an svg
// circle, which the same stretch would squash into an ellipse.
export default function Spark({ values, h = 44, color = 'var(--label)', goal = null, className = '' }) {
  const vs = (values || []).filter(v => v != null && isFinite(v))
  if (vs.length < 2) return <div className={'spark ' + className} style={{ height: h }} />
  const all = goal != null ? [...vs, goal] : vs
  const lo = Math.min(...all), hi = Math.max(...all)
  const pad = (hi - lo) * 0.12 || 1
  const y = v => (1 - (v - lo + pad) / (hi - lo + 2 * pad)) * 100
  const x = i => (i / (vs.length - 1)) * 100
  const pts = vs.map((v, i) => x(i).toFixed(2) + ',' + y(v).toFixed(2)).join(' ')
  return <div className={'spark ' + className} style={{ height: h, '--spark': color }} aria-hidden="true">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
      {goal != null && <line className="goal" x1="0" x2="100" y1={y(goal)} y2={y(goal)} />}
      <polyline points={pts} />
    </svg>
    <i style={{ left: '100%', top: y(vs[vs.length - 1]) + '%' }} />
  </div>
}
