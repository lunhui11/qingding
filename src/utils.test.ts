import { describe, expect, it } from 'vitest'
import { alertTriggered, calculatePositionProfit, fmtMoney, isTradingTime, secid, smartSignal } from './utils'
import type { PriceAlert, Quote } from './types'

const quote: Quote = { market: 'SH', code: '600519', name: '测试', price: 1500, previousClose: 1490, change: 10, changePercent: .67, mainNetInflow: null, mainNetRatio: null, superLargeNet: null, largeNet: null, amount: 1e9, volumeRatio: 1.5, actualTurnoverRate: 2.1, updatedAt: '', status: 'live' }
const alert = (metric: PriceAlert['metric'], threshold: number): PriceAlert => ({ id: 'a', secid: 'SH.600519', metric, threshold, enabled: true })

describe('format and identifiers', () => {
  it('formats capital with sign and units', () => { expect(fmtMoney(123_450_000)).toBe('+1.23亿'); expect(fmtMoney(-350_000)).toBe('-35万'); expect(fmtMoney(null)).toBe('暂无数据') })
  it('builds stable ids', () => expect(secid(quote)).toBe('SH.600519'))
})
describe('alerts', () => {
  it('handles price and percentage thresholds', () => { expect(alertTriggered(alert('priceAbove', 1499), quote)).toBe(true); expect(alertTriggered(alert('priceBelow', 1400), quote)).toBe(false); expect(alertTriggered(alert('changeAbove', .5), quote)).toBe(true) })
})

describe('smart signals', () => {
  const split = { buyAmount: 4e6, sellAmount: 2e6, netAmount: 2e6, signals: [], sampleCount: 160, coverageMinutes: 8, confidence: 72, updatedAt: '' }
  it('requires volume, price and both capital directions to agree', () => {
    expect(smartSignal({ ...quote, changePercent: 1, mainNetInflow: 5e6, volumeRatio: 2 }, split)).toBe('inflow')
    expect(smartSignal({ ...quote, changePercent: -1, mainNetInflow: -5e6, volumeRatio: 2 }, { ...split, netAmount: -2e6 })).toBe('outflow')
    expect(smartSignal({ ...quote, changePercent: 1, mainNetInflow: -5e6, volumeRatio: 2 }, split)).toBeNull()
  })
})
describe('trading sessions', () => {
  it('recognizes CN/HK common trading windows and weekends', () => {
    expect(isTradingTime(new Date('2026-09-07T10:00:00'))).toBe(true)
    expect(isTradingTime(new Date('2026-09-07T12:30:00'))).toBe(false)
    expect(isTradingTime(new Date('2026-09-06T10:00:00'))).toBe(false)
  })
})
describe('position profit', () => {
  it('calculates points, percentage and amount by lots', () => {
    expect(calculatePositionProfit(12, 10, 5, 100)).toEqual({ pointChange: 2, percent: 20, amount: 1000, grossAmount: 1000, fees: 0, shares: 500 })
    expect(calculatePositionProfit(9, 10, 2, 100)?.amount).toBe(-200)
    expect(calculatePositionProfit(null, 10, 2, 100)).toBeNull()
  })
  it('deducts both commissions and sell-side stamp duty', () => {
    const result = calculatePositionProfit(12, 10, 5, 100, { commissionRate: 2.5, minimumCommission: 5, stampDutyRate: 0.05 })!
    expect(result.grossAmount).toBe(1000)
    expect(result.fees).toBe(13)
    expect(result.amount).toBe(987)
  })
})
