import type { DetailData, HotRankItem, Market, Quote, SearchResult, SplitEstimate, SplitSignal, TradePrint, WatchItem } from './types'

const fields = 'f12,f13,f14,f2,f3,f4,f5,f6,f8,f10,f18,f21,f62,f184,f66,f72'
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
    if (!row) return { ...item, price: null, previousClose: null, change: null, changePercent: null, mainNetInflow: null, mainNetRatio: null, superLargeNet: null, largeNet: null, amount: null, volumeRatio: null, actualTurnoverRate: null, updatedAt: now, status: 'offline' as const }
    const volume = scaled(row.f5, 1); const price = scaled(row.f2, 1); const circulatingMarketCap = scaled(row.f21, 1)
    const floatShares = price && circulatingMarketCap ? circulatingMarketCap / price : null
    const actualTurnoverRate = item.market !== 'HK' && volume != null && floatShares ? volume * 100 / floatShares * 100 : scaled(row.f8, 1)
    return { market: item.market, code: item.code, name: row.f14 || item.name, price: scaled(row.f2, 1), previousClose: scaled(row.f18, 1), change: scaled(row.f4, 1), changePercent: scaled(row.f3, 1), mainNetInflow: scaled(row.f62, 1), mainNetRatio: scaled(row.f184, 1), superLargeNet: scaled(row.f66, 1), largeNet: scaled(row.f72, 1), amount: scaled(row.f6, 1), volumeRatio: scaled(row.f10, 1), actualTurnoverRate, updatedAt: now, status: 'live' as const }
  })
}

export async function fetchDetail(item: WatchItem): Promise<DetailData> {
  const secid = toSecid(item)
  const priceUrl = `https://push2his.eastmoney.com/api/qt/stock/trends2/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11&fields2=f51,f53&ndays=1&iscr=0`
  const fundUrl = `https://push2his.eastmoney.com/api/qt/stock/fflow/kline/get?secid=${secid}&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55&lmt=20&klt=101`
  const klineUrl = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57&klt=101&fqt=1&lmt=30&end=20500101`
  const tradesUrl = `https://push2.eastmoney.com/api/qt/stock/details/get?secid=${secid}&fields1=f1,f2,f3,f4,f5&fields2=f51,f52,f53,f54,f55&pos=-160`
  const [priceResult, fundResult, klineResult, tradesResult] = await Promise.allSettled([getJson(priceUrl), item.market === 'HK' ? Promise.resolve(null) : getJson(fundUrl), getJson(klineUrl), getJson(tradesUrl)])
  const trends: string[] = priceResult.status === 'fulfilled' ? priceResult.value?.data?.trends ?? [] : []
  const klines: string[] = fundResult.status === 'fulfilled' ? fundResult.value?.data?.klines ?? [] : []
  const tradeRows: string[] = tradesResult.status === 'fulfilled' ? tradesResult.value?.data?.details ?? [] : []
  const klineRows: string[] = klineResult.status === 'fulfilled' ? klineResult.value?.data?.klines ?? [] : []
  const trades = tradeRows.map(v => { const [time, price, volume, , side] = v.split(','); return { time, price: Number(price), volume: Number(volume), side: Number(side) as TradePrint['side'] } }).filter(v => Number.isFinite(v.price) && Number.isFinite(v.volume))
  return {
    price: trends.map(v => { const [time, price] = v.split(','); return { time, value: Number(price) } }).filter(v => Number.isFinite(v.value)),
    capital: klines.map(v => { const [time, value] = v.split(','); return { time, value: Number(value) } }).filter(v => Number.isFinite(v.value)),
    klines: klineRows.map(v => { const [date, open, close, high, low, volume, amount] = v.split(','); return { date, open: Number(open), close: Number(close), high: Number(high), low: Number(low), volume: Number(volume), amount: Number(amount) } }).filter(v => Number.isFinite(v.close)),
    splitSignals: detectSplitSignals(trades, item.market),
    splitEstimate: estimateSplitFlow(trades, item.market),
    updatedAt: new Date().toISOString()
  }
}

export async function fetchSplitEstimate(item: WatchItem): Promise<SplitEstimate> {
  const url = `https://push2.eastmoney.com/api/qt/stock/details/get?secid=${toSecid(item)}&fields1=f1,f2,f3,f4,f5&fields2=f51,f52,f53,f54,f55&pos=-160`
  const json = await getJson(url); const rows: string[] = json?.data?.details ?? []
  const trades = rows.map(v => { const [time, price, volume, , side] = v.split(','); return { time, price: Number(price), volume: Number(volume), side: Number(side) as TradePrint['side'] } }).filter(v => Number.isFinite(v.price) && Number.isFinite(v.volume))
  return estimateSplitFlow(trades, item.market)
}

const seconds = (time: string) => { const [h, m, s] = time.split(':').map(Number); return h * 3600 + m * 60 + s }
export function detectSplitSignals(trades: TradePrint[], market: Market): SplitSignal[] {
  const factor = market === 'HK' ? 1 : 100
  const usable = trades.filter(t => t.side === 1 || t.side === 2).map(t => ({ ...t, at: seconds(t.time), amount: t.price * t.volume * factor }))
  const candidates: SplitSignal[] = []
  for (let end = 0; end < usable.length; end++) {
    const recent = usable.filter((_, i) => i <= end && usable[end].at - usable[i].at <= 60)
    for (const sideCode of [1, 2] as const) {
      const same = recent.filter(t => t.side === sideCode && t.amount <= (market === 'HK' ? 300_000 : 1_000_000))
      const total = same.reduce((sum, t) => sum + t.amount, 0); const ratio = same.length / Math.max(1, recent.length)
      const minimum = market === 'HK' ? 500_000 : 2_000_000
      if (same.length >= 6 && ratio >= .7 && total >= minimum) candidates.push({ side: sideCode === 2 ? 'buy' : 'sell', startTime: same[0].time, endTime: same.at(-1)!.time, tradeCount: same.length, totalAmount: total, confidence: Math.min(95, Math.round(35 + ratio * 35 + Math.min(20, same.length * 2) + Math.min(5, total / minimum))) })
    }
  }
  const latest = new Map<'buy' | 'sell', SplitSignal>(); for (const signal of candidates) latest.set(signal.side, signal)
  return [...latest.values()].sort((a, b) => b.confidence - a.confidence)
}

export function estimateSplitFlow(trades: TradePrint[], market: Market): SplitEstimate {
  const signals = detectSplitSignals(trades, market)
  const buyAmount = signals.filter(v => v.side === 'buy').reduce((sum, v) => sum + v.totalAmount, 0)
  const sellAmount = signals.filter(v => v.side === 'sell').reduce((sum, v) => sum + v.totalAmount, 0)
  return { buyAmount, sellAmount, netAmount: buyAmount - sellAmount, signals, updatedAt: new Date().toISOString() }
}

export async function fetchHotRank(): Promise<HotRankItem[]> {
  const response = await fetch('https://emappdata.eastmoney.com/stockrank/getAllCurrentList', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ appId: 'appId01', globalId: '786e4c21-70dc-435a-93bb-38', marketType: '', pageNo: 1, pageSize: 10 }) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const json: any = await response.json(); const ranks: any[] = json?.data ?? []
  const items: WatchItem[] = ranks.map(v => ({ market: String(v.sc).startsWith('SH') ? 'SH' : 'SZ', code: String(v.sc).slice(2), name: String(v.sc) }))
  const quotes = await fetchQuotes(items)
  return quotes.map((quote, i) => ({ ...quote, rank: Number(ranks[i]?.rk ?? i + 1), rankChange: Number(ranks[i]?.hisRc ?? 0) }))
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
