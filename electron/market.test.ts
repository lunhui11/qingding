import { describe, expect, it } from 'vitest'
import { detectSplitSignals, marketFromId, parseDirectCode, toSecid } from './market'

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
