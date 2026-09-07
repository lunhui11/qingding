import { useMemo, useState } from 'react'
import type { KlinePoint } from '../types'

type Period = 5 | 10 | 30
const periods: Period[] = [5, 10, 30]

function movingAverage(points: KlinePoint[], period: Period) {
  return points.map((point, index) => ({ date: point.date, value: index + 1 < period ? null : points.slice(index + 1 - period, index + 1).reduce((sum, item) => sum + item.close, 0) / period }))
}

export default function Candlestick({ points }: { points: KlinePoint[] }) {
  const [collapsed, setCollapsed] = useState(false)
  const [visible, setVisible] = useState<Record<Period, boolean>>({ 5: true, 10: true, 30: true })
  const averages = useMemo(() => Object.fromEntries(periods.map(period => [period, movingAverage(points, period)])) as Record<Period, ReturnType<typeof movingAverage>>, [points])
  const latest = (period: Period) => averages[period].at(-1)?.value ?? null
  if (!points.length) return <div className="spark-empty">K 线暂时不可用</div>

  const allAverageValues = periods.flatMap(period => averages[period].flatMap(point => point.value == null ? [] : [point.value]))
  const min = Math.min(...points.map(v => v.low), ...allAverageValues); const max = Math.max(...points.map(v => v.high), ...allAverageValues); const range = max - min || 1
  const width = 300; const height = 86; const slot = width / points.length
  const y = (value: number) => 4 + (max - value) / range * (height - 8)
  const linePoints = (period: Period) => averages[period].map((point, index) => point.value == null ? null : `${index * slot + slot / 2},${y(point.value)}`).filter(Boolean).join(' ')

  return <div className={`kline-widget ${collapsed ? 'collapsed' : ''}`}>
    <div className="ma-toolbar">
      {periods.map(period => <button key={period} className={`ma${period} ${visible[period] ? 'active' : ''}`} onClick={() => setVisible(current => ({ ...current, [period]: !current[period] }))}>MA{period} <b>{latest(period)?.toFixed(2) ?? '—'}</b></button>)}
      <button className="chart-toggle" onClick={() => setCollapsed(value => !value)}>{collapsed ? '展开图表' : '收起图表'}</button>
    </div>
    {!collapsed && <svg className="candlestick" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label="30日K线与均线">
      {points.map((p, i) => { const x = i * slot + slot / 2; const up = p.close >= p.open; const top = y(Math.max(p.open, p.close)); const bodyHeight = Math.max(1.2, Math.abs(y(p.open) - y(p.close))); return <g className={up ? 'candle-up' : 'candle-down'} key={p.date}><line x1={x} x2={x} y1={y(p.high)} y2={y(p.low)}/><rect x={x - Math.max(1.5, slot * .26)} y={top} width={Math.max(3, slot * .52)} height={bodyHeight}/></g> })}
      {periods.map(period => visible[period] && <polyline key={period} className={`ma-line ma${period}`} points={linePoints(period)}/>)}
    </svg>}
  </div>
}
