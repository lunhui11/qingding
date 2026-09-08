import { useMemo, useState } from 'react'
import type { KlinePoint } from '../types'

type Period = 5 | 10 | 30
const periods: Period[] = [5, 10, 30]

function movingAverage(points: KlinePoint[], period: Period) {
  return points.map((point, index) => ({ date: point.date, value: index + 1 < period ? null : points.slice(index + 1 - period, index + 1).reduce((sum, item) => sum + item.close, 0) / period }))
}

export default function Candlestick({ points, costPrice }: { points: KlinePoint[]; costPrice?: number }) {
  const [collapsed, setCollapsed] = useState(false)
  const [visible, setVisible] = useState<Record<Period, boolean>>({ 5: true, 10: true, 30: true })
  const [hovered, setHovered] = useState<number | null>(null)
  const averages = useMemo(() => Object.fromEntries(periods.map(period => [period, movingAverage(points, period)])) as Record<Period, ReturnType<typeof movingAverage>>, [points])
  const latest = (period: Period) => averages[period].at(-1)?.value ?? null
  if (!points.length) return <div className="spark-empty">K 线暂时不可用</div>

  const allAverageValues = periods.flatMap(period => averages[period].flatMap(point => point.value == null ? [] : [point.value]))
  const costValues = costPrice && costPrice > 0 ? [costPrice] : []
  const min = Math.min(...points.map(v => v.low), ...allAverageValues, ...costValues); const max = Math.max(...points.map(v => v.high), ...allAverageValues, ...costValues); const range = max - min || 1
  const width = 300; const height = 86; const slot = width / points.length
  const y = (value: number) => 4 + (max - value) / range * (height - 8)
  const linePoints = (period: Period) => averages[period].map((point, index) => point.value == null ? null : `${index * slot + slot / 2},${y(point.value)}`).filter(Boolean).join(' ')

  return <div className={`kline-widget ${collapsed ? 'collapsed' : ''}`}>
    <div className="ma-toolbar">
      {periods.map(period => <button key={period} className={`ma${period} ${visible[period] ? 'active' : ''}`} onClick={() => setVisible(current => ({ ...current, [period]: !current[period] }))}>MA{period} <b>{latest(period)?.toFixed(2) ?? '—'}</b></button>)}
      {!!costValues.length && <span className="cost-legend">成本 {costPrice!.toFixed(costPrice! < 10 ? 3 : 2)}</span>}
      <button className="chart-toggle" onClick={() => setCollapsed(value => !value)}>{collapsed ? '展开图表' : '收起图表'}</button>
    </div>
    {!collapsed && hovered != null && <div className="kline-inspector"><b>{points[hovered].date}</b><span>开 {points[hovered].open}</span><span>高 {points[hovered].high}</span><span>低 {points[hovered].low}</span><span>收 {points[hovered].close}</span></div>}
    {!collapsed && <svg className="candlestick" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label="30日K线与均线" onMouseMove={event => { const box = event.currentTarget.getBoundingClientRect(); setHovered(Math.max(0, Math.min(points.length - 1, Math.floor((event.clientX - box.left) / box.width * points.length)))) }} onMouseLeave={() => setHovered(null)}>
      {points.map((p, i) => { const x = i * slot + slot / 2; const up = p.close >= p.open; const top = y(Math.max(p.open, p.close)); const bodyHeight = Math.max(1.2, Math.abs(y(p.open) - y(p.close))); return <g className={up ? 'candle-up' : 'candle-down'} key={p.date}><line x1={x} x2={x} y1={y(p.high)} y2={y(p.low)}/><rect x={x - Math.max(1.5, slot * .26)} y={top} width={Math.max(3, slot * .52)} height={bodyHeight}/></g> })}
      {periods.map(period => visible[period] && <polyline key={period} className={`ma-line ma${period}`} points={linePoints(period)}/>)}
      {!!costValues.length && <line className="cost-line" x1="0" x2={width} y1={y(costPrice!)} y2={y(costPrice!)}/>}
      {hovered != null && <line className="kline-crosshair" x1={hovered * slot + slot / 2} x2={hovered * slot + slot / 2} y1="0" y2={height}/>} 
    </svg>}
  </div>
}
