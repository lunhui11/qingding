import type { DetailData, Quote } from './types'

export function mergeQuote(loaded: Quote, previous?: Quote): Quote {
  if (!previous) return loaded
  if (loaded.status === 'offline' || loaded.price == null) return { ...previous, status: 'delayed' }
  // Keep missing values, but keep their original timestamp too. A backup price is not fresh fund data.
  const next = { ...loaded }
  const sameDay = new Date(loaded.updatedAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }) === new Date(previous.updatedAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
  for (const key of ['mainNetInflow', 'mainNetRatio', 'superLargeNet', 'largeNet', 'amount', 'volumeRatio', 'actualTurnoverRate'] as const) {
    const isFund = ['mainNetInflow', 'mainNetRatio', 'superLargeNet', 'largeNet'].includes(key)
    if (sameDay && next[key] == null && (!isFund || loaded.mainNetInflow == null)) next[key] = previous[key]
  }
  next.fundsUpdatedAt = loaded.mainNetInflow != null ? loaded.updatedAt : sameDay ? previous.fundsUpdatedAt ?? (previous.mainNetInflow != null ? previous.updatedAt : undefined) : undefined
  return next
}

export function mergeDetail(loaded: DetailData, previous?: DetailData): DetailData {
  const next = { ...loaded }
  if (!previous) return next
  for (const key of ['intraday', 'price', 'averagePrice', 'klines', 'capital'] as const) {
    if (!next[key].length) (next[key] as unknown[]) = previous[key]
  }
  const sameDay = !loaded.tradeDate || !previous.tradeDate || loaded.tradeDate === previous.tradeDate
  if (!loaded.trades.length && sameDay) {
    next.trades = previous.trades; next.minuteCapital = previous.minuteCapital
    next.institutionActivity = previous.institutionActivity; next.quantActivity = previous.quantActivity
    next.flow5m = previous.flow5m; next.flow10m = previous.flow10m
    next.flow5mTradeCount = previous.flow5mTradeCount; next.flow10mTradeCount = previous.flow10mTradeCount
    next.flowCoverageMinutes = previous.flowCoverageMinutes
    next.tradesUpdatedAt = previous.tradesUpdatedAt ?? previous.updatedAt
  } else next.tradesUpdatedAt = loaded.trades.length ? loaded.updatedAt : undefined
  next.book = loaded.book ?? previous.book
  // An all-empty response must not make retained charts look newly updated.
  if (!loaded.intraday.length && !loaded.klines.length && !loaded.capital.length && !loaded.trades.length && !loaded.book) next.updatedAt = previous.updatedAt
  return next
}
