import { net } from 'electron'
import type { DetailData, HotRankItem, Market, Quote, SearchResult, SectorRankItem, SectorStockItem, SplitEstimate, SplitSignal, TradePrint, TrendPoint, WatchItem } from './types'

const fields = 'f12,f13,f14,f2,f3,f4,f5,f6,f8,f10,f18,f21,f62,f184,f66,f72'
const headers = { Accept: 'application/json,text/plain,*/*', Referer: 'https://quote.eastmoney.com/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/132.0.0.0 Safari/537.36' }

export function toSecid(item: Pick<WatchItem, 'market' | 'code'>): string {
  if (item.market === 'SH') return `1.${item.code}`
  if (item.market === 'SZ') return `0.${item.code}`
  return `116.${item.code.padStart(5, '0')}`
}
export function marketFromId(id: number, code: string): Market { return id === 116 ? 'HK' : id === 1 ? 'SH' : code.startsWith('6') || code.startsWith('9') ? 'SH' : 'SZ' }
const scaled = (value: unknown, divisor = 100): number | null => typeof value === 'number' && Number.isFinite(value) ? value / divisor : null

async function getJson(url: string, timeout = 8000): Promise<any> {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout + attempt * 3000)
    try { const response = await net.fetch(url, { headers, signal: controller.signal }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return await response.json() }
    catch (error) { lastError = error }
    finally { clearTimeout(timer) }
  }
  throw lastError
}

const numberOrNull = (value: string | undefined) => { const parsed = Number(value); return value && Number.isFinite(parsed) ? parsed : null }
export function parseTencentQuotes(text: string, items: WatchItem[]): Quote[] {
  const rows = new Map([...text.matchAll(/v_([^=]+)="([^"]*)"/g)].map(match => [match[1].toLowerCase(), match[2].split('~')]))
  const now = new Date().toISOString()
  return items.map(item => {
    const symbol = `${item.market === 'HK' ? 'hk' : item.market.toLowerCase()}${item.code}`; const row = rows.get(symbol)
    if (!row) return { ...item, price: null, previousClose: null, change: null, changePercent: null, mainNetInflow: null, mainNetRatio: null, superLargeNet: null, largeNet: null, amount: null, volumeRatio: null, actualTurnoverRate: null, updatedAt: now, status: 'offline' as const }
    return { ...item, name: row[1] || item.name, price: numberOrNull(row[3]), previousClose: numberOrNull(row[4]), change: numberOrNull(row[31]), changePercent: numberOrNull(row[32]), mainNetInflow: null, mainNetRatio: null, superLargeNet: null, largeNet: null, amount: null, volumeRatio: null, actualTurnoverRate: numberOrNull(row[38]), updatedAt: now, status: 'delayed' as const }
  })
}

async function fetchBackupQuotes(items: WatchItem[]): Promise<Quote[]> {
  const symbols = items.map(item => `${item.market === 'HK' ? 'hk' : item.market.toLowerCase()}${item.code}`).join(',')
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await net.fetch(`https://qt.gtimg.cn/q=${symbols}`, { headers: { Referer: 'https://gu.qq.com/', 'User-Agent': headers['User-Agent'] }, signal: controller.signal })
    if (!response.ok) throw new Error(`Backup HTTP ${response.status}`)
    const bytes = await response.arrayBuffer(); return parseTencentQuotes(new TextDecoder('gbk').decode(bytes), items)
  } finally { clearTimeout(timer) }
}

export async function fetchQuotes(items: WatchItem[]): Promise<Quote[]> {
  if (!items.length) return []
  const secids = items.map(toSecid).join(',')
  const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=${fields}&secids=${encodeURIComponent(secids)}`
  let json: any
  try { json = await getJson(url) } catch { return fetchBackupQuotes(items) }
  const rows: any[] = json?.data?.diff ?? []
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

export async function fetchDetail(item: WatchItem, scope: 'full' | 'live' | 'history' = 'full', largeOrderThreshold = 200_000): Promise<DetailData> {
  const secid = toSecid(item)
  const priceUrl = `https://push2his.eastmoney.com/api/qt/stock/trends2/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11&fields2=f51,f52,f53,f54,f55,f56,f57,f58&ndays=1&iscr=0`
  const fundUrl = `https://push2his.eastmoney.com/api/qt/stock/fflow/kline/get?secid=${secid}&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55&lmt=20&klt=101`
  const klineUrl = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57&klt=101&fqt=1&lmt=30&end=20500101`
  const tradesUrl = `https://push2.eastmoney.com/api/qt/stock/details/get?secid=${secid}&fields1=f1,f2,f3,f4,f5&fields2=f51,f52,f53,f54,f55&pos=-500`
  const loadLive = scope !== 'history'; const loadHistory = scope !== 'live'
  const [priceResult, fundResult, klineResult, tradesResult] = await Promise.allSettled([
    loadLive ? getJson(priceUrl) : Promise.resolve(null),
    loadHistory && item.market !== 'HK' ? getJson(fundUrl) : Promise.resolve(null),
    loadHistory ? getJson(klineUrl) : Promise.resolve(null),
    loadLive ? getJson(tradesUrl) : Promise.resolve(null)
  ])
  const trends: string[] = priceResult.status === 'fulfilled' ? priceResult.value?.data?.trends ?? [] : []
  const klines: string[] = fundResult.status === 'fulfilled' ? fundResult.value?.data?.klines ?? [] : []
  const tradeRows: string[] = tradesResult.status === 'fulfilled' ? tradesResult.value?.data?.details ?? [] : []
  const klineRows: string[] = klineResult.status === 'fulfilled' ? klineResult.value?.data?.klines ?? [] : []
  const trades = tradeRows.map(v => { const [time, price, volume, , side] = v.split(','); return { time, price: Number(price), volume: Number(volume), side: Number(side) as TradePrint['side'] } }).filter(v => Number.isFinite(v.price) && Number.isFinite(v.volume))
  const intraday = buildIntraday(trends, item.market)
  const threshold = Math.max(10_000, Math.min(100_000_000, Number(largeOrderThreshold) || 200_000))
  const flow5m = estimateRecentMainFlow(trades, item.market, 5, threshold); const flow10m = estimateRecentMainFlow(trades, item.market, 10, threshold)
  const minuteCapital = buildEstimatedCapitalTrend(trades, item.market, threshold)
  return {
    intraday,
    price: intraday.map(point => ({ time: point.time, value: point.close })),
    averagePrice: intraday.map(point => ({ time: point.time, value: point.average })),
    capital: klines.map(v => { const [time, value] = v.split(','); return { time, value: Number(value) } }).filter(v => Number.isFinite(v.value)),
    minuteCapital,
    flow5m: flow5m.value,
    flow10m: flow10m.value,
    flow5mTradeCount: flow5m.tradeCount,
    flow10mTradeCount: flow10m.tradeCount,
    flowCoverageMinutes: flow10m.coverageMinutes,
    klines: klineRows.map(v => { const [date, open, close, high, low, volume, amount] = v.split(','); return { date, open: Number(open), close: Number(close), high: Number(high), low: Number(low), volume: Number(volume), amount: Number(amount) } }).filter(v => Number.isFinite(v.close)),
    splitSignals: detectSplitSignals(trades, item.market),
    splitEstimate: estimateSplitFlow(trades, item.market, threshold),
    updatedAt: new Date().toISOString()
  }
}

export function buildIntraday(rows: string[], market: Market) {
  const factor = market === 'HK' ? 1 : 100; let cumulativeAmount = 0; let cumulativeShares = 0
  return rows.map(row => {
    const [time, open, close, high, low, volume, amount] = row.split(','); const volumeNumber = Number(volume); const amountNumber = Number(amount)
    cumulativeAmount += Number.isFinite(amountNumber) ? amountNumber : 0; cumulativeShares += Number.isFinite(volumeNumber) ? volumeNumber * factor : 0
    return { time, open: Number(open), close: Number(close), high: Number(high), low: Number(low), volume: volumeNumber, amount: amountNumber, average: cumulativeShares ? cumulativeAmount / cumulativeShares : Number(close) }
  }).filter(point => Number.isFinite(point.open) && Number.isFinite(point.close) && Number.isFinite(point.high) && Number.isFinite(point.low) && Number.isFinite(point.volume) && Number.isFinite(point.amount) && Number.isFinite(point.average))
}

const tradeSeconds = (time: string) => { const [hour, minute, second] = time.split(':').map(Number); return hour * 3600 + minute * 60 + second }
export function estimateRecentMainFlow(trades: TradePrint[], market: Market, minutes: number, largeOrderThreshold = 200_000) {
  const factor = market === 'HK' ? 1 : 100
  const usable = trades.filter(trade => trade.side === 1 || trade.side === 2).map(trade => ({ ...trade, at: tradeSeconds(trade.time), amount: trade.price * trade.volume * factor })).sort((a, b) => a.at - b.at)
  if (!usable.length) return { value: null, tradeCount: 0, coverageMinutes: 0 }
  const latest = usable.at(-1)!.at; const window = usable.filter(trade => trade.at >= latest - minutes * 60 && trade.amount >= largeOrderThreshold)
  const value = window.reduce((sum, trade) => sum + (trade.side === 2 ? trade.amount : -trade.amount), 0)
  return { value, tradeCount: window.length, coverageMinutes: Math.min(minutes, Math.max(0, (latest - usable[0].at) / 60)) }
}

export function buildEstimatedCapitalTrend(trades: TradePrint[], market: Market, largeOrderThreshold = 200_000): TrendPoint[] {
  const factor = market === 'HK' ? 1 : 100; let cumulative = 0
  return trades.filter(trade => trade.side === 1 || trade.side === 2).map(trade => ({ trade, amount: trade.price * trade.volume * factor })).filter(item => item.amount >= largeOrderThreshold).map(({ trade, amount }) => { cumulative += trade.side === 2 ? amount : -amount; return { time: trade.time, value: cumulative } })
}

export function recentNetFlow(points: TrendPoint[], minutes: number): number | null {
  if (points.length <= minutes) return null
  return points.at(-1)!.value - points[points.length - 1 - minutes].value
}

export async function fetchSplitEstimate(item: WatchItem, largeOrderThreshold = 200_000): Promise<SplitEstimate> {
  const url = `https://push2.eastmoney.com/api/qt/stock/details/get?secid=${toSecid(item)}&fields1=f1,f2,f3,f4,f5&fields2=f51,f52,f53,f54,f55&pos=-160`
  const json = await getJson(url); const rows: string[] = json?.data?.details ?? []
  const trades = rows.map(v => { const [time, price, volume, , side] = v.split(','); return { time, price: Number(price), volume: Number(volume), side: Number(side) as TradePrint['side'] } }).filter(v => Number.isFinite(v.price) && Number.isFinite(v.volume))
  return estimateSplitFlow(trades, item.market, largeOrderThreshold)
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

export function estimateSplitFlow(trades: TradePrint[], market: Market, _largeOrderThreshold = 200_000): SplitEstimate {
  const signals = detectSplitSignals(trades, market)
  const buyAmount = signals.filter(v => v.side === 'buy').reduce((sum, v) => sum + v.totalAmount, 0)
  const sellAmount = signals.filter(v => v.side === 'sell').reduce((sum, v) => sum + v.totalAmount, 0)
  const timed = trades.map(trade => tradeSeconds(trade.time)).filter(Number.isFinite).sort((a, b) => a - b)
  const coverageMinutes = timed.length > 1 ? Math.max(0, (timed.at(-1)! - timed[0]) / 60) : 0
  const confidence = signals.length ? Math.max(...signals.map(signal => signal.confidence)) : Math.min(45, Math.round(trades.length / 4))
  return { buyAmount, sellAmount, netAmount: buyAmount - sellAmount, signals, sampleCount: trades.length, coverageMinutes, confidence, updatedAt: new Date().toISOString() }
}

export async function fetchHotRank(): Promise<HotRankItem[]> {
  const ranks = await fetchPopularityRows(10)
  const items: WatchItem[] = ranks.map(v => ({ market: String(v.sc).startsWith('SH') ? 'SH' : 'SZ', code: String(v.sc).slice(2), name: String(v.sc) }))
  const quotes = await fetchQuotes(items)
  return quotes.map((quote, i) => ({ ...quote, rank: Number(ranks[i]?.rk ?? i + 1), rankChange: Number(ranks[i]?.hisRc ?? 0) }))
}

async function fetchPopularityRows(pageSize: number): Promise<any[]> {
  const response = await net.fetch('https://emappdata.eastmoney.com/stockrank/getAllCurrentList', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ appId: 'appId01', globalId: '786e4c21-70dc-435a-93bb-38', marketType: '', pageNo: 1, pageSize }) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const json: any = await response.json(); return json?.data ?? []
}

export async function fetchSectorRank(): Promise<SectorRankItem[]> {
  const load = async (kind: SectorRankItem['kind'], filter: string) => {
    const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=10&po=1&np=1&fltt=2&invt=2&fid=f62&fs=${encodeURIComponent(filter)}&fields=f12,f14,f3,f62,f184`
    const json = await getJson(url); const rows: any[] = json?.data?.diff ?? []
    return rows.map(row => ({ code: String(row.f12 ?? ''), name: String(row.f14 ?? ''), kind, changePercent: scaled(row.f3, 1), mainNetInflow: scaled(row.f62, 1), mainNetRatio: scaled(row.f184, 1) }))
  }
  const results = await Promise.allSettled([load('industry', 'm:90+t:2'), load('concept', 'm:90+t:3')])
  return results.flatMap(result => result.status === 'fulfilled' ? result.value : []).filter(item => item.name && item.mainNetInflow != null).sort((a, b) => (b.mainNetInflow ?? 0) - (a.mainNetInflow ?? 0)).slice(0, 10)
}

export async function fetchSectorStocks(sector: SectorRankItem): Promise<SectorStockItem[]> {
  const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=100&po=1&np=1&fltt=2&invt=2&fid=f3&fs=${encodeURIComponent(`b:${sector.code}`)}&fields=${fields}`
  const json = await getJson(url); const rows: any[] = json?.data?.diff ?? []; const now = new Date().toISOString()
  const quotes: Quote[] = rows.filter(row => [0, 1].includes(Number(row.f13))).map(row => {
    const market: Market = Number(row.f13) === 1 ? 'SH' : 'SZ'; const code = String(row.f12 ?? '').padStart(6, '0')
    return { market, code, name: String(row.f14 ?? code), price: scaled(row.f2, 1), previousClose: scaled(row.f18, 1), change: scaled(row.f4, 1), changePercent: scaled(row.f3, 1), mainNetInflow: scaled(row.f62, 1), mainNetRatio: scaled(row.f184, 1), superLargeNet: scaled(row.f66, 1), largeNet: scaled(row.f72, 1), amount: scaled(row.f6, 1), volumeRatio: scaled(row.f10, 1), actualTurnoverRate: scaled(row.f8, 1), updatedAt: now, status: 'live' as const }
  }).filter(item => item.changePercent != null).sort((a, b) => (b.changePercent ?? -Infinity) - (a.changePercent ?? -Infinity)).slice(0, 20)
  let popularity = new Map<string, number>()
  try { popularity = new Map((await fetchPopularityRows(100)).map((row, index) => [String(row.sc).toUpperCase(), Number(row.rk ?? index + 1)])) } catch { /* popularity label stays unavailable */ }
  return labelSectorLeaders(quotes, popularity)
}

export function labelSectorLeaders(quotes: Quote[], popularity: Map<string, number>): SectorStockItem[] {
  const key = (item: Quote) => `${item.market}${item.code}`
  const gainLeader = quotes[0] ? key(quotes[0]) : ''
  const capitalLeader = [...quotes].filter(item => item.mainNetInflow != null).sort((a, b) => (b.mainNetInflow ?? -Infinity) - (a.mainNetInflow ?? -Infinity))[0]
  const popularityLeader = [...quotes].filter(item => popularity.has(key(item))).sort((a, b) => popularity.get(key(a))! - popularity.get(key(b))!)[0]
  return quotes.map(item => ({ ...item, popularityRank: popularity.get(key(item)) ?? null, leaderLabels: [key(item) === gainLeader ? '涨幅龙头' : null, capitalLeader && key(item) === key(capitalLeader) ? '资金龙头' : null, popularityLeader && key(item) === key(popularityLeader) ? '人气龙头' : null].filter(Boolean) as SectorStockItem['leaderLabels'] }))
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
