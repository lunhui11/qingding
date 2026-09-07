import type { DetailData, Market, Quote, SearchResult, WatchItem } from './types'

const fields = 'f12,f13,f14,f2,f3,f4,f18,f62,f184,f66,f72'
const headers = { Referer: 'https://quote.eastmoney.com/', 'User-Agent': 'Mozilla/5.0 MarketFloat/1.0' }

export function toSecid(item: Pick<WatchItem, 'market' | 'code'>): string {
  if (item.market === 'SH') return `1.${item.code}`
  if (item.market === 'SZ') return `0.${item.code}`
  return `116.${item.code.padStart(5, '0')}`
}
export function marketFromId(id: number, code: string): Market { return id === 116 ? 'HK' : id === 1 ? 'SH' : code.startsWith('6') || code.startsWith('9') ? 'SH' : 'SZ' }
const scaled = (value: unknown, divisor = 100): number | null => typeof value === 'number' && Number.isFinite(value) ? value / divisor : null

async function getJson(url: string, timeout = 8000): Promise<any> {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout)
  try { const response = await fetch(url, { headers, signal: controller.signal }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return await response.json() }
  finally { clearTimeout(timer) }
}

export async function fetchQuotes(items: WatchItem[]): Promise<Quote[]> {
  if (!items.length) return []
  const secids = items.map(toSecid).join(',')
  const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=${fields}&secids=${encodeURIComponent(secids)}`
  const json = await getJson(url); const rows: any[] = json?.data?.diff ?? []
  const now = new Date().toISOString()
  return items.map(item => {
    const expectedMarket = item.market === 'HK' ? 116 : item.market === 'SH' ? 1 : 0
    const row = rows.find(r => Number(r.f13) === expectedMarket && String(r.f12).padStart(item.market === 'HK' ? 5 : 6, '0') === item.code.padStart(item.market === 'HK' ? 5 : 6, '0'))
    if (!row) return { ...item, price: null, previousClose: null, change: null, changePercent: null, mainNetInflow: null, mainNetRatio: null, superLargeNet: null, largeNet: null, updatedAt: now, status: 'offline' as const }
    return { market: item.market, code: item.code, name: row.f14 || item.name, price: scaled(row.f2, 1), previousClose: scaled(row.f18, 1), change: scaled(row.f4, 1), changePercent: scaled(row.f3, 1), mainNetInflow: scaled(row.f62, 1), mainNetRatio: scaled(row.f184, 1), superLargeNet: scaled(row.f66, 1), largeNet: scaled(row.f72, 1), updatedAt: now, status: 'live' as const }
  })
}

export async function fetchDetail(item: WatchItem): Promise<DetailData> {
  const secid = toSecid(item)
  const priceUrl = `https://push2his.eastmoney.com/api/qt/stock/trends2/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11&fields2=f51,f53&ndays=1&iscr=0`
  const fundUrl = `https://push2his.eastmoney.com/api/qt/stock/fflow/kline/get?secid=${secid}&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55&lmt=20&klt=101`
  const [priceResult, fundResult] = await Promise.allSettled([getJson(priceUrl), item.market === 'HK' ? Promise.resolve(null) : getJson(fundUrl)])
  const trends: string[] = priceResult.status === 'fulfilled' ? priceResult.value?.data?.trends ?? [] : []
  const klines: string[] = fundResult.status === 'fulfilled' ? fundResult.value?.data?.klines ?? [] : []
  return {
    price: trends.map(v => { const [time, price] = v.split(','); return { time, value: Number(price) } }).filter(v => Number.isFinite(v.value)),
    capital: klines.map(v => { const [time, value] = v.split(','); return { time, value: Number(value) } }).filter(v => Number.isFinite(v.value)),
    updatedAt: new Date().toISOString()
  }
}

export function parseDirectCode(query: string): SearchResult[] {
  const q = query.trim().toUpperCase().replace(/\s/g, '')
  if (/^(SH|SZ)\d{6}$/.test(q)) return [{ market: q.slice(0, 2) as Market, code: q.slice(2), name: q }]
  if (/^HK\d{1,5}$/.test(q)) return [{ market: 'HK', code: q.slice(2).padStart(5, '0'), name: q }]
  if (/^\d{6}$/.test(q)) return [{ market: q.startsWith('6') || q.startsWith('9') ? 'SH' : 'SZ', code: q, name: q }]
  if (/^\d{1,5}$/.test(q)) return [{ market: 'HK', code: q.padStart(5, '0'), name: `HK${q.padStart(5, '0')}` }]
  return []
}

export async function searchStocks(query: string): Promise<SearchResult[]> {
  const direct = parseDirectCode(query); if (direct.length) return direct
  const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(query)}&type=14&count=8&token=D43BF722C8E33BDC906FB84D85E326E8`
  const json = await getJson(url)
  return (json?.QuotationCodeTable?.Data ?? []).filter((v: any) => ['1', '0', '116'].includes(String(v.MktNum))).map((v: any) => ({ market: marketFromId(Number(v.MktNum), v.Code), code: String(v.Code).padStart(Number(v.MktNum) === 116 ? 5 : 6, '0'), name: v.Name })).slice(0, 8)
}
