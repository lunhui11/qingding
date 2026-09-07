import type { KlinePoint } from '../types'

export default function Candlestick({ points }: { points: KlinePoint[] }) {
  if (!points.length) return <div className="spark-empty">K 线暂时不可用</div>
  const min = Math.min(...points.map(v => v.low)); const max = Math.max(...points.map(v => v.high)); const range = max - min || 1
  const width = 300; const height = 86; const slot = width / points.length
  const y = (value: number) => 4 + (max - value) / range * (height - 8)
  return <svg className="candlestick" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label="30日K线">
    {points.map((p, i) => { const x = i * slot + slot / 2; const up = p.close >= p.open; const top = y(Math.max(p.open, p.close)); const bodyHeight = Math.max(1.2, Math.abs(y(p.open) - y(p.close))); return <g className={up ? 'candle-up' : 'candle-down'} key={p.date}><line x1={x} x2={x} y1={y(p.high)} y2={y(p.low)}/><rect x={x - Math.max(1.5, slot * .26)} y={top} width={Math.max(3, slot * .52)} height={bodyHeight}/></g> })}
  </svg>
}
