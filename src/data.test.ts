import { describe, expect, it } from 'vitest'
import { mergeAlertRules, mergeDetail, mergeQuote } from './data'
import type { DetailData, PriceAlert, Quote } from './types'
const quote: Quote = { market: 'SH', code: '600519', name: 'test', price: 10, previousClose: 9, change: 1, changePercent: 11, mainNetInflow: 1000, mainNetRatio: 1, largeNet: 500, superLargeNet: 500, amount: 10000, volumeRatio: 1, actualTurnoverRate: 1, bid1Price: null, bid1Volume: null, ask1Price: null, ask1Volume: null, updatedAt: '2026-10-06T02:00:00Z', status: 'live' }
const detail: DetailData = { intraday: [], price: [{ time: '10:00', value: 10 }], averagePrice: [], capital: [], minuteCapital: [], trades: [{ time: '10:00:00', price: 10, volume: 100, side: 2 }], institutionActivity: { score: 90 } as DetailData['institutionActivity'], quantActivity: { score: 90 } as DetailData['quantActivity'], flow5m: 1000, flow10m: 1000, flow5mTradeCount: 1, flow10mTradeCount: 1, flowCoverageMinutes: 1, klines: [], updatedAt: quote.updatedAt, tradeDate: '2026-10-06' }
describe('last good data', () => {
  it('clears yesterday\'s intraday charts and book while retaining historical charts', () => {
    const previous = { ...detail, averagePrice: detail.price, capital: detail.price, book: quote }
    const next = mergeDetail({ ...detail, price: [], averagePrice: [], trades: [], capital: [], tradeDate: '2026-10-07', updatedAt: '2026-10-07T02:00:00Z' }, previous)
    expect(next.price).toEqual([]); expect(next.averagePrice).toEqual([]); expect(next.book).toBeUndefined()
    expect(next.capital).toEqual(previous.capital); expect(next.updatedAt).toBe('2026-10-07T02:00:00Z')
  })
  it('retains prices and original timestamps after missing/offline rows', () => {
    expect(mergeQuote({ ...quote, price: null, mainNetInflow: null, status: 'offline', updatedAt: 'later' }, quote)).toMatchObject({ price: 10, mainNetInflow: 1000, updatedAt: quote.updatedAt, status: 'delayed' })
  })
  it('does not claim retained fund flow refreshed along with a backup price', () => {
    expect(mergeQuote({ ...quote, price: 11, mainNetInflow: null, status: 'delayed', updatedAt: '2026-10-06T02:01:00Z' }, quote)).toMatchObject({ price: 11, mainNetInflow: 1000, fundsUpdatedAt: quote.updatedAt })
  })
  it('keeps a genuinely insufficient new sample instead of yesterday\'s confident score', () => {
    expect(mergeDetail({ ...detail, institutionActivity: { score: null } as DetailData['institutionActivity'] }, detail).institutionActivity.score).toBeNull()
  })
  it('keeps old detail timestamps on a completely empty failed response', () => {
    const next = mergeDetail({ ...detail, price: [], trades: [], updatedAt: 'later' }, detail)
    expect(next.price).toEqual(detail.price); expect(next.updatedAt).toBe(detail.updatedAt); expect(next.tradesUpdatedAt).toBe(detail.updatedAt)
  })
  it('does not carry over previous-day prints to a new trading day', () => {
    expect(mergeDetail({ ...detail, trades: [], flow5m: null, tradeDate: '2026-10-07' }, detail).trades).toEqual([])
  })
  it('does not carry yesterday\'s fund flows into a new live trading day', () => {
    expect(mergeQuote({ ...quote, mainNetInflow: null, updatedAt: '2026-10-07T02:00:00Z' }, quote).mainNetInflow).toBeNull()
  })
  it('does not combine a new main flow with stale large-order components', () => {
    expect(mergeQuote({ ...quote, mainNetInflow: 20, largeNet: null, updatedAt: '2026-10-06T02:01:00Z' }, quote).largeNet).toBeNull()
  })
})

describe('alert edits during notification delivery', () => {
  it('preserves the latest cooldown while allowing additions, removals and disabling', () => {
    const rule: PriceAlert = { id: 'a', secid: 'SH.600519', metric: 'priceAbove', threshold: 10, enabled: true }
    const other = { ...rule, id: 'other', secid: 'SZ.000001' }
    const current = [{ ...rule, lastTriggered: 1000 }, { ...rule, id: 'removed' }, other]
    expect(mergeAlertRules(current, rule.secid, [{ ...rule, enabled: false }, { ...rule, id: 'new' }])).toEqual([
      other, { ...rule, enabled: false, lastTriggered: 1000 }, { ...rule, id: 'new' }
    ])
  })
})
