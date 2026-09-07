import type { Market, PriceAlert, Quote, Settings, SplitEstimate, WatchItem } from './types'

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

export type SmartSignal = 'inflow' | 'outflow' | null
export const smartSignal = (quote?: Quote, split?: SplitEstimate): SmartSignal => {
  if (!quote || !split || quote.volumeRatio == null || quote.changePercent == null || quote.mainNetInflow == null) return null
  if (quote.volumeRatio < 1.8 || Math.abs(quote.changePercent) < 0.3 || Math.abs(quote.mainNetInflow) < 3_000_000 || Math.abs(split.netAmount) < 1_000_000) return null
  if (quote.changePercent > 0 && quote.mainNetInflow > 0 && split.netAmount > 0) return 'inflow'
  if (quote.changePercent < 0 && quote.mainNetInflow < 0 && split.netAmount < 0) return 'outflow'
  return null
}
export const displayMarket = (market: Market) => market === 'HK' ? '港' : market === 'SH' ? '沪' : '深'

export interface TradingFees { commissionRate: number; minimumCommission: number; stampDutyRate: number }
export interface PositionProfit { pointChange: number; percent: number; amount: number; grossAmount: number; fees: number; shares: number }
export const calculatePositionProfit = (price: number | null, costPrice?: number, holdingLots?: number, lotSize = 100, fees?: TradingFees): PositionProfit | null => {
  if (price == null || !Number.isFinite(price) || !costPrice || costPrice <= 0 || holdingLots == null || holdingLots < 0 || !Number.isFinite(lotSize) || lotSize <= 0) return null
  const pointChange = price - costPrice; const shares = holdingLots * lotSize
  const buyValue = costPrice * shares; const sellValue = price * shares
  const rate = Math.max(0, fees?.commissionRate ?? 0) / 10_000; const minimum = Math.max(0, fees?.minimumCommission ?? 0)
  const buyCommission = shares ? Math.max(buyValue * rate, minimum) : 0; const sellCommission = shares ? Math.max(sellValue * rate, minimum) : 0
  const stampDuty = sellValue * Math.max(0, fees?.stampDutyRate ?? 0) / 100
  const grossAmount = pointChange * shares; const totalFees = buyCommission + sellCommission + stampDuty; const amount = grossAmount - totalFees
  return { pointChange, percent: buyValue + buyCommission ? amount / (buyValue + buyCommission) * 100 : 0, amount, grossAmount, fees: totalFees, shares }
}
