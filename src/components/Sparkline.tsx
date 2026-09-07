import type { TrendPoint } from '../types'
export default function Sparkline({ points, positive = true, height = 48 }: { points: TrendPoint[]; positive?: boolean; height?: number }) {
  if (points.length < 2) return <div className="spark-empty">等待走势</div>
  const values = points.map(p => p.value); const min = Math.min(...values); const max = Math.max(...values); const range = max - min || 1
  const poly = points.map((p, i) => `${(i / (points.length - 1)) * 100},${height - 4 - ((p.value - min) / range) * (height - 8)}`).join(' ')
  return <svg className={`spark ${positive ? 'positive' : 'negative'}`} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-label="走势"><polyline points={poly} vectorEffect="non-scaling-stroke" /></svg>
}
