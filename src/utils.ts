import type { Market, PriceAlert, Quote, Settings, WatchItem } from './types'

export const secid = (v: Pick<WatchItem, 'market' | 'code'>) => `${v.market}.${v.code}`
export const fmtPrice = (value: number | null) => value == null ? '—' : value < 10 ? value.toFixed(3) : value.toFixed(2)
export const fmtMoney = (value: number | null) => {
  if (value == null) return '暂无数据'
  const abs = Math.abs(value); const sign = value > 0 ? '+' : value < 0 ? '-' : ''
  if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(2)}亿`
  if (abs >= 1e4) return `${sign}${(abs / 1e4).toFixed(0)}万`
  return `${sign}${abs.toFixed(0)}`
}
export const directionClass = (value: number | null, settings: Settings) => {
  if (!value) return 'neutral'
  const up = value > 0
  return settings.colorMode === 'cn' ? (up ? 'rise' : 'fall') : (up ? 'fall' : 'rise')
}
export const isTradingTime = (date = new Date()) => {
  const day = date.getDay(); if (day === 0 || day === 6) return false
  const minutes = date.getHours() * 60 + date.getMinutes()
  return (minutes >= 570 && minutes <= 720) || (minutes >= 780 && minutes <= 960)
}
export const alertTriggered = (alert: PriceAlert, quote: Quote) => {
  const value = alert.metric.startsWith('price') ? quote.price : quote.changePercent
  if (value == null) return false
  return alert.metric.endsWith('Above') ? value >= alert.threshold : value <= alert.threshold
}
export const displayMarket = (market: Market) => market === 'HK' ? '港' : market === 'SH' ? '沪' : '深'
