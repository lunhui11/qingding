import { describe, expect, it } from 'vitest'
import { buildIntraday, estimateInstitutionActivity, estimateQuantActivity, estimateRecentMainFlow, labelSectorLeaders, marketFromId, mergeTradeSamples, parseDirectCode, parseTencentQuotes, recentNetFlow, toSecid } from './market'
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
  it('reads HK source time and does not fabricate a book from zero placeholder sizes', () => {
    const row = Array(39).fill(''); row[3] = '427.2'; row[9] = '427.2'; row[10] = '0'; row[19] = '427.2'; row[20] = '0'; row[30] = '2026/10/06 11:35:06'
    expect(parseTencentQuotes(`v_hk00700="${row.join('~')}";`, [{ market: 'HK', code: '00700', name: 'test' }])[0]).toMatchObject({ price: 427.2, bid1Price: null, ask1Price: null, updatedAt: '2026-10-06T11:35:06+08:00' })
  })
  it('parses Tencent rows without inventing fund-flow values', () => {
    const row = Array(39).fill(''); row[1] = '贵州茅台'; row[3] = '1501.00'; row[4] = '1490.00'; row[9] = '1500.90'; row[10] = '18'; row[19] = '1501.10'; row[20] = '23'; row[31] = '11.00'; row[32] = '0.74'; row[38] = '0.52'
    const quote = parseTencentQuotes(`v_sh600519="${row.join('~')}";`, [{ market: 'SH', code: '600519', name: '测试' }])[0]
    expect(quote).toMatchObject({ name: '贵州茅台', price: 1501, previousClose: 1490, change: 11, changePercent: .74, actualTurnoverRate: .52, bid1Price: 1500.9, bid1Volume: 18, ask1Price: 1501.1, ask1Volume: 23, mainNetInflow: null, status: 'delayed' })
  })
})

describe('sector leaders', () => {
  it('labels gain, fund-flow and popularity leaders from their own measures', () => {
    const base: Quote = { market: 'SH', code: '000001', name: '甲', price: 10, previousClose: 9, change: 1, changePercent: 10, mainNetInflow: 2, mainNetRatio: 1, superLargeNet: 1, largeNet: 1, amount: 10, volumeRatio: 1, actualTurnoverRate: 1, bid1Price: 9.99, bid1Volume: 10, ask1Price: 10.01, ask1Volume: 12, updatedAt: '', status: 'live' }
    const items = labelSectorLeaders([base, { ...base, market: 'SZ', code: '000002', name: '乙', changePercent: 5, mainNetInflow: 9 }], new Map([['SZ000002', 3], ['SH000001', 10]]))
    expect(items[0].leaderLabels).toContain('涨幅龙头')
    expect(items[1].leaderLabels).toEqual(expect.arrayContaining(['资金龙头', '人气龙头']))
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

describe('locally calculated intraday data', () => {
  it('uses minute close for price and cumulative amount divided by shares for average', () => {
    const points = buildIntraday(['2026-09-08 09:30,10,10,10,10,100,100000,999', '2026-09-08 09:31,10,12,12,10,100,120000,999'], 'SH')
    expect(points.map(point => point.close)).toEqual([10, 12])
    expect(points.map(point => point.average)).toEqual([10, 11])
  })
  it('calculates 5 and 10 minute active large-order net flow from raw prints', () => {
    const trades = [{ time: '09:59:00', price: 10, volume: 300, side: 2 as const }, { time: '10:00:00', price: 10, volume: 250, side: 1 as const }, { time: '10:06:00', price: 10, volume: 400, side: 2 as const }]
    expect(estimateRecentMainFlow(trades, 'SH', 5)).toMatchObject({ value: 400000, tradeCount: 1 })
    expect(estimateRecentMainFlow(trades, 'SH', 10)).toMatchObject({ value: 450000, tradeCount: 3 })
    expect(estimateRecentMainFlow(trades, 'SH', 10, 350000)).toMatchObject({ value: 400000, tradeCount: 1 })
  })
})

describe('institution activity estimate', () => {
  it('scores dense active large trades and reports their direction', () => {
    const trades = Array.from({ length: 40 }, (_, i) => ({ time: `10:${String(Math.floor(i / 2)).padStart(2, '0')}:${String((i % 2) * 20).padStart(2, '0')}`, price: 10, volume: 300, side: 2 as const }))
    const result = estimateInstitutionActivity(trades, 'SH', 200_000)
    expect(result).toMatchObject({ score: 100, level: '高度活跃', direction: 'inflow', largeTradeCount: 40, largeTradeRatio: 1 })
    expect(result.confidence).toBeGreaterThan(50)
  })
  it('returns no score when the recent sample is insufficient', () => {
    const result = estimateInstitutionActivity([{ time: '10:00:00', price: 10, volume: 300, side: 2 }], 'SH', 200_000)
    expect(result).toMatchObject({ score: null, level: '样本不足' })
  })
})

describe('quant activity estimate', () => {
  it('scores frequent, regular, alternating small prints without claiming identity', () => {
    const trades = Array.from({ length: 60 }, (_, i) => ({ time: `10:0${Math.floor(i / 12)}:${String((i % 12) * 5).padStart(2, '0')}`, price: 10, volume: 10, side: (i % 2 ? 1 : 2) as 1 | 2 }))
    const result = estimateQuantActivity(trades, 'SH', 200_000)
    expect(result.score).not.toBeNull()
    expect(result.alternationRatio).toBe(1)
    expect(result.smallTradeRatio).toBe(1)
    expect(result.direction).toBe('neutral')
  })
  it('anchors the window to the latest print even when it is neutral', () => {
    expect(estimateRecentMainFlow([{ time: '10:00:00', price: 10, volume: 300, side: 2 }, { time: '10:10:00', price: 10, volume: 1, side: 4 }], 'SH', 5)).toMatchObject({ value: 0, tradeCount: 0 })
  })
  it('does not turn an empty field into zero or contaminate the average', () => {
    const rows = ['2026-09-08 09:30,10,,10,10,100,100000', '2026-09-08 09:31,12,12,12,12,100,120000']
    expect(buildIntraday(rows, 'SH')).toMatchObject([{ close: 12, average: 12 }])
  })
  it('accumulates overlapping snapshots without dropping legitimate identical prints', () => {
    const a = { time: '10:00:00', price: 10, volume: 300, side: 2 as const }; const b = { ...a, time: '10:01:00' }
    expect(mergeTradeSamples([a, a], [a, a, b])).toEqual([a, a, b])
    expect(mergeTradeSamples([a], [a, a])).toEqual([a, a])
    expect(mergeTradeSamples([a], [{ ...a, time: '10:11:00' }])).toHaveLength(1)
  })
})
