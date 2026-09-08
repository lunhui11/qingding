import { describe, expect, it } from 'vitest'
import { detectSplitSignals, labelSectorLeaders, marketFromId, parseDirectCode, parseTencentQuotes, recentNetFlow, toSecid } from './market'
import type { Quote } from './types'

describe('market identifiers', () => {
  it('maps API secids', () => {
    expect(toSecid({ market: 'SH', code: '600519' })).toBe('1.600519')
    expect(toSecid({ market: 'SZ', code: '000001' })).toBe('0.000001')
    expect(toSecid({ market: 'HK', code: '700' })).toBe('116.00700')
  })
  it('parses direct input', () => {
    expect(parseDirectCode('600519')[0]).toMatchObject({ market: 'SH', code: '600519' })
    expect(parseDirectCode('sz000001')[0]).toMatchObject({ market: 'SZ', code: '000001' })
    expect(parseDirectCode('HK700')[0]).toMatchObject({ market: 'HK', code: '00700' })
  })
  it('maps provider market ids', () => { expect(marketFromId(116, '00700')).toBe('HK'); expect(marketFromId(1, '000001')).toBe('SH') })
})

describe('backup quotes', () => {
  it('parses Tencent rows without inventing fund-flow values', () => {
    const row = Array(39).fill(''); row[1] = '贵州茅台'; row[3] = '1501.00'; row[4] = '1490.00'; row[31] = '11.00'; row[32] = '0.74'; row[38] = '0.52'
    const quote = parseTencentQuotes(`v_sh600519="${row.join('~')}";`, [{ market: 'SH', code: '600519', name: '测试' }])[0]
    expect(quote).toMatchObject({ name: '贵州茅台', price: 1501, previousClose: 1490, change: 11, changePercent: .74, actualTurnoverRate: .52, mainNetInflow: null, status: 'delayed' })
  })
})

describe('sector leaders', () => {
  it('labels gain, fund-flow and popularity leaders from their own measures', () => {
    const base: Quote = { market: 'SH', code: '000001', name: '甲', price: 10, previousClose: 9, change: 1, changePercent: 10, mainNetInflow: 2, mainNetRatio: 1, superLargeNet: 1, largeNet: 1, amount: 10, volumeRatio: 1, actualTurnoverRate: 1, updatedAt: '', status: 'live' }
    const items = labelSectorLeaders([base, { ...base, market: 'SZ', code: '000002', name: '乙', changePercent: 5, mainNetInflow: 9 }], new Map([['SZ000002', 3], ['SH000001', 10]]))
    expect(items[0].leaderLabels).toContain('涨幅龙头')
    expect(items[1].leaderLabels).toEqual(expect.arrayContaining(['资金龙头', '人气龙头']))
  })
})

describe('split-order radar', () => {
  it('detects a dense same-side cluster without claiming certainty', () => {
    const trades = Array.from({ length: 8 }, (_, i) => ({ time: `10:00:${String(i * 5).padStart(2, '0')}`, price: 10, volume: 400, side: 2 as const }))
    const signals = detectSplitSignals(trades, 'SH')
    expect(signals[0]).toMatchObject({ side: 'buy', tradeCount: 8, totalAmount: 3_200_000 })
    expect(signals[0].confidence).toBeLessThan(100)
  })
  it('ignores sparse or mixed prints', () => {
    const trades = Array.from({ length: 5 }, (_, i) => ({ time: `10:00:${String(i * 10).padStart(2, '0')}`, price: 10, volume: 10, side: (i % 2 ? 1 : 2) as 1 | 2 }))
    expect(detectSplitSignals(trades, 'SH')).toEqual([])
  })
})

describe('minute capital windows', () => {
  const points = Array.from({ length: 12 }, (_, i) => ({ time: `10:${String(i).padStart(2, '0')}`, value: i * 1_000_000 }))
  it('calculates change from cumulative capital flow', () => {
    expect(recentNetFlow(points, 5)).toBe(5_000_000)
    expect(recentNetFlow(points, 10)).toBe(10_000_000)
    expect(recentNetFlow(points.slice(0, 5), 5)).toBeNull()
  })
})
