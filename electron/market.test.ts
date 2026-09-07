import { describe, expect, it } from 'vitest'
import { marketFromId, parseDirectCode, toSecid } from './market'

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
