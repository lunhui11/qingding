import { afterEach, describe, expect, it, vi } from 'vitest'
const transport = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('electron', () => ({ net: { fetch: transport.fetch }, session: { fromPartition: () => ({ setProxy: async () => {}, fetch: transport.fetch }) } }))
import { fetchDetail, fetchQuotes, searchStocks } from './market'
const item = { market: 'SH' as const, code: '600519', name: 'test' }
const jsonResponse = (value: unknown) => new Response(JSON.stringify(value))
afterEach(() => { transport.fetch.mockReset(); vi.useRealTimers() })
describe('provider failure and schema changes', () => {
  it('accepts HK fund-flow only with explicit large/super-large source values and marks stale quote times', async () => {
    transport.fetch.mockImplementation(async () => jsonResponse({ data: { diff: [{ f12: '00700', f13: 116, f2: 427.4, f62: -13343120, f66: 12414680, f72: -25757800, f124: 1791258612 }] } }))
    const result = (await fetchQuotes([{ market: 'HK', code: '00700', name: 'test' }]))[0]
    expect(result.mainNetInflow).toBe(result.superLargeNet! + result.largeNet!)
    transport.fetch.mockImplementation(async () => jsonResponse({ data: { diff: [{ f12: '00700', f13: 116, f2: 427.4, f62: -13343120, f124: 1 }] } }))
    expect((await fetchQuotes([{ market: 'HK', code: '00700', name: 'test' }]))[0]).toMatchObject({ mainNetInflow: null, status: 'delayed' })
  })
  it('accepts keyed diff rows and never mistakes market capitalization for ask volume', async () => {
    transport.fetch.mockResolvedValue(jsonResponse({ data: { diff: { 0: { f12: '600519', f13: 1, f2: 10, f20: 1e11, f31: 999, f32: 888, f62: '-' } } } }))
    expect((await fetchQuotes([item]))[0]).toMatchObject({ price: 10, mainNetInflow: null, ask1Volume: null, bid1Price: null })
  })
  it('falls back after a valid JSON response with no primary rows', async () => {
    const row = Array(39).fill(''); row[3] = '12'; row[4] = '11'; row[9] = '11.9'; row[10] = '8'; row[19] = '12.1'; row[20] = '9'
    transport.fetch.mockImplementation(async (url: string) => url.includes('gtimg') ? new Response(`v_sh600519="${row.join('~')}";`) : jsonResponse({ data: null }))
    expect((await fetchQuotes([item]))[0]).toMatchObject({ price: 12, bid1Price: 11.9, bid1Volume: 8, ask1Price: 12.1, ask1Volume: 9, status: 'delayed' })
  })
  it('handles malformed detail and search shapes without rendering invented zeros', async () => {
    transport.fetch.mockImplementation(async () => jsonResponse({ data: { trends: {}, klines: [null, '2026-10-06,,,,,,'], details: [null, '10:00:00,,10,0,2'] }, QuotationCodeTable: { Data: 'invalid' } }))
    const result = await fetchDetail(item)
    expect(result.intraday).toEqual([]); expect(result.trades).toEqual([]); expect(result.klines).toEqual([]); expect(result.flow5m).toBeNull()
    expect(await searchStocks('名字')).toEqual([])
  })
  it('bounds a stalled response body, not only the time to receive headers', async () => {
    vi.useFakeTimers()
    transport.fetch.mockImplementation(async (_url: string, options: RequestInit) => ({ ok: true, arrayBuffer: () => new Promise((_, reject) => options.signal!.addEventListener('abort', () => reject(new Error('timeout')))) }))
    const failure = expect(searchStocks('timeout')).rejects.toThrow('timeout')
    await vi.advanceTimersByTimeAsync(16000); await failure
  })
})
