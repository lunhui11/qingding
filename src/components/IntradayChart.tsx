import { useState } from 'react'
import type { IntradayPoint, Market } from '../types'

const WIDTH = 340; const PLOT_RIGHT = 294; const PRICE_TOP = 8; const PRICE_BOTTOM = 104; const VOLUME_TOP = 112; const VOLUME_BOTTOM = 137

function sessionPosition(time: string, market: Market) {
  const value = time.slice(-5); const [hour, minute] = value.split(':').map(Number); const total = hour * 60 + minute
  if (market === 'HK') {
    const elapsed = total <= 720 ? total - 570 : 150 + total - 780
    return Math.max(0, Math.min(330, elapsed)) / 330
  }
  const elapsed = total <= 690 ? total - 570 : 120 + total - 780
  return Math.max(0, Math.min(240, elapsed)) / 240
}

export default function IntradayChart({ points, previousClose, market }: { points: IntradayPoint[]; previousClose: number | null; market: Market }) {
  const [hovered, setHovered] = useState<number | null>(null)
  if (points.length < 2) return <div className="intraday-empty">等待当天成交数据</div>
  const values = points.flatMap(point => [point.close, point.average]); const center = previousClose && previousClose > 0 ? previousClose : (Math.min(...values) + Math.max(...values)) / 2
  const distance = Math.max(...values.map(value => Math.abs(value - center)), center * .001); const min = center - distance * 1.08; const max = center + distance * 1.08; const range = max - min || 1
  const x = (point: IntradayPoint) => sessionPosition(point.time, market) * PLOT_RIGHT
  const y = (value: number) => PRICE_BOTTOM - (value - min) / range * (PRICE_BOTTOM - PRICE_TOP)
  const line = (pick: (point: IntradayPoint) => number) => points.map((point, index) => `${index ? 'L' : 'M'}${x(point).toFixed(1)},${y(pick(point)).toFixed(1)}`).join(' ')
  const maxVolume = Math.max(...points.map(point => point.volume), 1); const latest = points.at(-1)!; const active = hovered == null ? latest : points[Math.min(hovered, points.length - 1)]
  const labels = market === 'HK' ? ['09:30', '12:00/13:00', '16:00'] : ['09:30', '11:30/13:00', '15:00']
  const inspect = (clientX: number, left: number, width: number) => {
    const chartX = Math.max(0, Math.min(PLOT_RIGHT, (clientX - left) / width * WIDTH))
    let closest = 0; let distance = Infinity
    points.forEach((point, index) => { const next = Math.abs(x(point) - chartX); if (next < distance) { closest = index; distance = next } })
    setHovered(closest)
  }
  const activeX = hovered == null ? null : x(active)
  return <div className="intraday-widget"><div className="intraday-legend"><span className="inspect-time">{hovered == null ? '最新' : active.time.slice(-5)}</span><span>价格 <b>{active.close.toFixed(active.close < 10 ? 3 : 2)}</b></span><span className="average-legend">成交均价 <b>{active.average.toFixed(active.average < 10 ? 3 : 2)}</b></span><span>成交量 <b>{new Intl.NumberFormat('zh-CN').format(active.volume)}</b></span></div><svg className="intraday-chart" viewBox={`0 0 ${WIDTH} 151`} role="img" aria-label="当日完整分时成交图" onMouseMove={event => { const box = event.currentTarget.getBoundingClientRect(); inspect(event.clientX, box.left, box.width) }} onMouseLeave={() => setHovered(null)}>
    {[0, .25, .5, .75, 1].map(ratio => <g key={ratio}><line className={ratio === .5 ? 'previous-line' : 'grid-line'} x1="0" x2={PLOT_RIGHT} y1={PRICE_TOP + ratio * (PRICE_BOTTOM - PRICE_TOP)} y2={PRICE_TOP + ratio * (PRICE_BOTTOM - PRICE_TOP)}/><text className="axis-label" x={WIDTH - 2} y={PRICE_TOP + ratio * (PRICE_BOTTOM - PRICE_TOP) + 3} textAnchor="end">{(max - ratio * range).toFixed(max < 10 ? 3 : 2)}</text></g>)}
    {points.map(point => { const height = Math.max(1, point.volume / maxVolume * (VOLUME_BOTTOM - VOLUME_TOP)); return <rect className={point.close >= point.open ? 'volume-up' : 'volume-down'} key={point.time} x={x(point)} y={VOLUME_BOTTOM - height} width="1" height={height}/> })}
    <path className="price-path" d={line(point => point.close)}/><path className="average-path" d={line(point => point.average)}/>
    {activeX != null && <g className="chart-crosshair"><line x1={activeX} x2={activeX} y1={PRICE_TOP} y2={VOLUME_BOTTOM}/><circle className="price-dot" cx={activeX} cy={y(active.close)} r="2.5"/><circle className="average-dot" cx={activeX} cy={y(active.average)} r="2.5"/></g>}
    <text className="time-label" x="0" y="149">{labels[0]}</text><text className="time-label" x={PLOT_RIGHT * (market === 'HK' ? 150 / 330 : .5)} y="149" textAnchor="middle">{labels[1]}</text><text className="time-label" x={PLOT_RIGHT} y="149" textAnchor="end">{labels[2]}</text>
  </svg></div>
}
