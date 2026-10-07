import { net, session } from 'electron'
import type { DetailData, HotRankItem, InstitutionActivity, Market, QuantActivity, Quote, SearchResult, SectorRankItem, SectorStockItem, TradePrint, TrendPoint, WatchItem } from './types'

const fields = 'f12,f13,f14,f2,f3,f4,f5,f6,f8,f10,f18,f21,f62,f184,f66,f72,f124'
const headers = { Accept: 'application/json,text/plain,*/*', Referer: 'https://quote.eastmoney.com/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/132.0.0.0 Safari/537.36' }
let directSessionReady: Promise<Electron.Session> | undefined
let preferDirectUntil = 0

function getDirectSession() {
  if (!directSessionReady) directSessionReady = (async () => {
    const direct = session.fromPartition('market-direct', { cache: false })
    await direct.setProxy({ mode: 'direct' })
    return direct
  })()
  return directSessionReady
}

async function fetchWithRoutes(url: string, init: RequestInit = {}, timeout = 8000) {
  let lastError: unknown
  const system = { name: 'system', request: (options: RequestInit) => net.fetch(url, options) }
  const direct = { name: 'direct', request: async (options: RequestInit) => (await getDirectSession()).fetch(url, options) }
  const routes = Date.now() < preferDirectUntil ? [direct, system] : [system, direct]
  for (const route of routes) {
    const routeTimeout = route.name === 'system' ? Math.min(2500, timeout) : timeout
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), routeTimeout)
    try {
      const response = await route.request({ ...init, signal: controller.signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      if (route.name === 'direct') preferDirectUntil = Date.now() + 300_000
      // Keep the deadline alive until the response body finishes, not just the headers.
      return await response.arrayBuffer()
    } catch (error) { lastError = error; if (route.name === 'system') preferDirectUntil = Date.now() + 300_000 }
    finally { clearTimeout(timer) }
  }
  throw lastError
}

export function toSecid(item: Pick<WatchItem, 'market' | 'code'>): string {
  if (item.market === 'SH') return `1.${item.code}`
  if (item.market === 'SZ') return `0.${item.code}`
  return `116.${item.code.padStart(5, '0')}`
}
export function marketFromId(id: number, code: string): Market { return id === 116 ? 'HK' : id === 1 ? 'SH' : code.startsWith('6') || code.startsWith('9') ? 'SH' : 'SZ' }
const scaled = (value: unknown, divisor = 100): number | null => typeof value === 'number' && Number.isFinite(value) ? value / divisor : null

async function getJson(url: string, timeout = 8000, init: RequestInit = {}): Promise<any> {
  const bytes = await fetchWithRoutes(url, { headers, ...init }, timeout)
  return JSON.parse(new TextDecoder().decode(bytes))
}

const numberOrNull = (value: string | undefined) => { const parsed = Number(value); return value?.trim() && Number.isFinite(parsed) ? parsed : null }
const objectRows = (value: unknown): any[] => (Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : []).filter(row => row && typeof row === 'object')
const stringRows = (value: unknown): string[] => Array.isArray(value) ? value.filter(row => typeof row === 'string') : []
const quoteTimestamp = (value: unknown, fallback: string) => typeof value === 'number' && value > 0 && value < 10_000_000_000 ? new Date(value * 1000).toISOString() : fallback
export function parseTencentQuotes(text: string, items: WatchItem[]): Quote[] {
  const rows = new Map([...text.matchAll(/v_([^=]+)="([^"]*)"/g)].map(match => [match[1].toLowerCase(), match[2].split('~')]))
  const now = new Date().toISOString()
  return items.map(item => {
    const symbol = `${item.market === 'HK' ? 'hk' : item.market.toLowerCase()}${item.code}`; const row = rows.get(symbol)
    if (!row) return { ...item, price: null, previousClose: null, change: null, changePercent: null, mainNetInflow: null, mainNetRatio: null, superLargeNet: null, largeNet: null, amount: null, volumeRatio: null, actualTurnoverRate: null, bid1Price: null, bid1Volume: null, ask1Price: null, ask1Volume: null, updatedAt: now, status: 'offline' as const }
    const rawTime = row[30] ?? ''
    const parsedTime = /^\d{14}$/.test(rawTime) ? `${rawTime.slice(0, 4)}-${rawTime.slice(4, 6)}-${rawTime.slice(6, 8)}T${rawTime.slice(8, 10)}:${rawTime.slice(10, 12)}:${rawTime.slice(12, 14)}+08:00` : /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/.test(rawTime) ? `${rawTime.replaceAll('/', '-').replace(' ', 'T')}+08:00` : now
    const timestamp = Number.isFinite(Date.parse(parsedTime)) ? parsedTime : now
    const amount = numberOrNull(row[37])
    const bidVolume = numberOrNull(row[10]); const askVolume = numberOrNull(row[20])
    const bidAvailable = (bidVolume ?? 0) > 0 && (numberOrNull(row[9]) ?? 0) > 0
    const askAvailable = (askVolume ?? 0) > 0 && (numberOrNull(row[19]) ?? 0) > 0
    return { ...item, name: row[1] || item.name, price: numberOrNull(row[3]), previousClose: numberOrNull(row[4]), change: numberOrNull(row[31]), changePercent: numberOrNull(row[32]), mainNetInflow: null, mainNetRatio: null, superLargeNet: null, largeNet: null, amount: item.market !== 'HK' && amount != null ? amount * 10000 : null, volumeRatio: null, actualTurnoverRate: numberOrNull(row[38]), bid1Price: bidAvailable ? numberOrNull(row[9]) : null, bid1Volume: bidAvailable ? bidVolume : null, ask1Price: askAvailable ? numberOrNull(row[19]) : null, ask1Volume: askAvailable ? askVolume : null, updatedAt: timestamp, status: numberOrNull(row[3]) == null ? 'offline' as const : 'delayed' as const }
  })
}

async function fetchBackupQuotes(items: WatchItem[]): Promise<Quote[]> {
  const symbols = items.map(item => `${item.market === 'HK' ? 'hk' : item.market.toLowerCase()}${item.code}`).join(',')
  const bytes = await fetchWithRoutes(`https://qt.gtimg.cn/q=${symbols}`, { headers: { Referer: 'https://gu.qq.com/', 'User-Agent': headers['User-Agent'] } }, 10000)
  return parseTencentQuotes(new TextDecoder('gbk').decode(bytes), items)
}

export async function fetchQuotes(items: WatchItem[]): Promise<Quote[]> {
  if (!items.length) return []
  const secids = items.map(toSecid).join(',')
  const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=${fields}&secids=${encodeURIComponent(secids)}`
  let json: any
  try { json = await getJson(url) } catch { return fetchBackupQuotes(items) }
  const rows = objectRows(json?.data?.diff)
  if (!rows.length) return fetchBackupQuotes(items)
  const now = new Date().toISOString()
  const quotes: Quote[] = items.map(item => {
    const expectedMarket = item.market === 'HK' ? 116 : item.market === 'SH' ? 1 : 0
    const row = rows.find(r => Number(r.f13) === expectedMarket && String(r.f12).padStart(item.market === 'HK' ? 5 : 6, '0') === item.code.padStart(item.market === 'HK' ? 5 : 6, '0'))
    if (!row) return { ...item, price: null, previousClose: null, change: null, changePercent: null, mainNetInflow: null, mainNetRatio: null, superLargeNet: null, largeNet: null, amount: null, volumeRatio: null, actualTurnoverRate: null, bid1Price: null, bid1Volume: null, ask1Price: null, ask1Volume: null, updatedAt: now, status: 'offline' as const }
    const volume = scaled(row.f5, 1); const price = scaled(row.f2, 1); const circulatingMarketCap = scaled(row.f21, 1)
    const floatShares = price && circulatingMarketCap ? circulatingMarketCap / price : null
    const actualTurnoverRate = item.market !== 'HK' && volume != null && floatShares ? volume * 100 / floatShares * 100 : scaled(row.f8, 1)
    const hasFunds = item.market !== 'HK' || [row.f62, row.f66, row.f72].every(value => typeof value === 'number' && Number.isFinite(value))
    const timestamp = quoteTimestamp(row.f124, now)
    // ulist/clist f20 is market capitalization, not ask volume. Book data is loaded separately.
    return { market: item.market, code: item.code, name: typeof row.f14 === 'string' ? row.f14 : item.name, price, previousClose: scaled(row.f18, 1), change: scaled(row.f4, 1), changePercent: scaled(row.f3, 1), mainNetInflow: hasFunds ? scaled(row.f62, 1) : null, mainNetRatio: hasFunds ? scaled(row.f184, 1) : null, superLargeNet: hasFunds ? scaled(row.f66, 1) : null, largeNet: hasFunds ? scaled(row.f72, 1) : null, amount: scaled(row.f6, 1), volumeRatio: scaled(row.f10, 1), actualTurnoverRate, bid1Price: null, bid1Volume: null, ask1Price: null, ask1Volume: null, updatedAt: timestamp, status: price == null || Date.now() - Date.parse(timestamp) > 120000 ? 'delayed' as const : 'live' as const }
  })
  const missing = items.filter((_, index) => quotes[index].price == null)
  if (missing.length) {
    try {
      const backup = new Map((await fetchBackupQuotes(missing)).map(quote => [toSecid(quote), quote]))
      return quotes.map(quote => quote.price == null && backup.get(toSecid(quote))?.price != null ? backup.get(toSecid(quote))! : quote)
    } catch { /* Keep valid primary quotes when the backup source also fails. */ }
  }
  return quotes
}

const tradeCache = new Map<string, { date: string; trades: TradePrint[] }>()
export async function fetchDetail(item: WatchItem, scope: 'full' | 'live' | 'history' = 'full', largeOrderThreshold = 200_000): Promise<DetailData> {
  const secid = toSecid(item)
  const priceUrl = `https://push2his.eastmoney.com/api/qt/stock/trends2/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11&fields2=f51,f52,f53,f54,f55,f56,f57,f58&ndays=1&iscr=0`
  const fundUrl = `https://push2his.eastmoney.com/api/qt/stock/fflow/kline/get?secid=${secid}&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55&lmt=20&klt=101`
  const klineUrl = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57&klt=101&fqt=1&lmt=30&end=20500101`
  const tradesUrl = `https://push2.eastmoney.com/api/qt/stock/details/get?secid=${secid}&fields1=f1,f2,f3,f4,f5&fields2=f51,f52,f53,f54,f55&pos=-500`
  const loadLive = scope !== 'history'; const loadHistory = scope !== 'live'
  const [priceResult, fundResult, klineResult, tradesResult, bookResult] = await Promise.allSettled([
    loadLive ? getJson(priceUrl) : Promise.resolve(null),
    loadHistory && item.market !== 'HK' ? getJson(fundUrl) : Promise.resolve(null),
    loadHistory ? getJson(klineUrl) : Promise.resolve(null),
    loadLive ? getJson(tradesUrl) : Promise.resolve(null),
    loadLive ? fetchBackupQuotes([item]) : Promise.resolve([])
  ])
  const trends = stringRows(priceResult.status === 'fulfilled' ? priceResult.value?.data?.trends : null)
  const klines = stringRows(fundResult.status === 'fulfilled' ? fundResult.value?.data?.klines : null)
  const tradeRows = stringRows(tradesResult.status === 'fulfilled' ? tradesResult.value?.data?.details : null)
  const klineRows = stringRows(klineResult.status === 'fulfilled' ? klineResult.value?.data?.klines : null)
  const incoming = tradeRows.map(v => { const [time, price, volume, , side] = v.split(','); return { time, price: numberOrNull(price), volume: numberOrNull(volume), side: Number(side) } }).filter(v => Number.isFinite(tradeSeconds(v.time)) && v.price != null && v.price > 0 && v.volume != null && v.volume > 0 && [1, 2, 4].includes(v.side)) as TradePrint[]
  const book = bookResult.status === 'fulfilled' && bookResult.value[0]?.status !== 'offline' ? bookResult.value[0] : undefined
  const date = (book ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date(book.updatedAt)) : undefined) ?? trends.at(-1)?.slice(0, 10) ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
  const previous = tradeCache.get(secid)
  const trades = incoming.length ? mergeTradeSamples(previous?.date === date ? previous.trades : [], incoming) : []
  if (trades.length) { tradeCache.set(secid, { date, trades }); if (tradeCache.size > 30) tradeCache.delete(tradeCache.keys().next().value!) }
  const intraday = buildIntraday(trends, item.market)
  const threshold = Math.max(10_000, Math.min(100_000_000, Number(largeOrderThreshold) || 200_000))
  const flow5m = estimateRecentMainFlow(trades, item.market, 5, threshold); const flow10m = estimateRecentMainFlow(trades, item.market, 10, threshold)
  const minuteCapital = buildEstimatedCapitalTrend(trades, item.market, threshold)
  const institutionActivity = estimateInstitutionActivity(trades, item.market, threshold)
  const quantActivity = estimateQuantActivity(trades, item.market, threshold)
  return {
    intraday,
    price: intraday.map(point => ({ time: point.time, value: point.close })),
    averagePrice: intraday.map(point => ({ time: point.time, value: point.average })),
    capital: klines.map(v => { const [time, value] = v.split(','); return { time, value: numberOrNull(value) } }).filter(v => v.value != null) as TrendPoint[],
    minuteCapital,
    trades,
    institutionActivity,
    quantActivity,
    book,
    tradeDate: date,
    flow5m: flow5m.value,
    flow10m: flow10m.value,
    flow5mTradeCount: flow5m.tradeCount,
    flow10mTradeCount: flow10m.tradeCount,
    flowCoverageMinutes: flow10m.coverageMinutes,
    klines: klineRows.map(v => { const [date, ...values] = v.split(','); const [open, close, high, low, volume, amount] = values.map(numberOrNull); return { date, open, close, high, low, volume, amount } }).filter(v => [v.open, v.close, v.high, v.low, v.volume, v.amount].every(value => value != null)) as DetailData['klines'],
    updatedAt: new Date().toISOString()
  }
}

export function buildIntraday(rows: string[], market: Market) {
  const factor = market === 'HK' ? 1 : 100; let cumulativeAmount = 0; let cumulativeShares = 0
  const result: DetailData['intraday'] = []
  for (const row of rows) {
    const [time, ...values] = row.split(','); const [open, close, high, low, volume, amount] = values.map(numberOrNull)
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(time) || !Number.isFinite(Date.parse(`${time.replace(' ', 'T')}+08:00`))) continue
    if ([open, close, high, low, volume, amount].some(value => value == null || value < 0)) continue
    cumulativeAmount += amount!; cumulativeShares += volume! * factor
    result.push({ time, open: open!, close: close!, high: high!, low: low!, volume: volume!, amount: amount!, average: cumulativeShares ? cumulativeAmount / cumulativeShares : close! })
  }
  return result
}

const tradeSeconds = (time: string) => { if (!/^\d{2}:\d{2}:\d{2}$/.test(time ?? '')) return NaN; const [hour, minute, second] = time.split(':').map(Number); return hour < 24 && minute < 60 && second < 60 ? hour * 3600 + minute * 60 + second : NaN }
export function mergeTradeSamples(previous: TradePrint[], incoming: TradePrint[]): TradePrint[] {
  // Snapshot overlap must not double-count, while identical prints within a snapshot remain separate.
  const key = (trade: TradePrint) => `${trade.time}/${trade.price}/${trade.volume}/${trade.side}`
  const counts = new Map<string, number>(); const seen = new Map<string, number>(); const result = [...previous]
  for (const trade of previous) counts.set(key(trade), (counts.get(key(trade)) ?? 0) + 1)
  for (const trade of incoming) { const id = key(trade); const count = (seen.get(id) ?? 0) + 1; seen.set(id, count); if (count > (counts.get(id) ?? 0)) result.push(trade) }
  result.sort((a, b) => tradeSeconds(a.time) - tradeSeconds(b.time))
  const latest = tradeSeconds(result.at(-1)?.time ?? '')
  return result.filter(trade => tradeSeconds(trade.time) >= latest - 600).slice(-10000)
}
export function estimateRecentMainFlow(trades: TradePrint[], market: Market, minutes: number, largeOrderThreshold = 200_000) {
  const factor = market === 'HK' ? 1 : 100
  const usable = trades.map(trade => ({ ...trade, at: tradeSeconds(trade.time), amount: trade.price * trade.volume * factor })).filter(trade => Number.isFinite(trade.at) && Number.isFinite(trade.amount) && trade.amount > 0).sort((a, b) => a.at - b.at)
  if (!usable.length) return { value: null, tradeCount: 0, coverageMinutes: 0 }
  const latest = usable.at(-1)!.at; const window = usable.filter(trade => trade.at > latest - minutes * 60 && trade.amount >= largeOrderThreshold && (trade.side === 1 || trade.side === 2))
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

export function estimateInstitutionActivity(trades: TradePrint[], market: Market, largeOrderThreshold = 200_000): InstitutionActivity {
  const factor = market === 'HK' ? 1 : 100
  const usable = trades.filter(trade => trade.side === 1 || trade.side === 2).map(trade => ({ ...trade, at: tradeSeconds(trade.time), amount: trade.price * trade.volume * factor })).filter(trade => Number.isFinite(trade.at) && Number.isFinite(trade.amount) && trade.amount > 0).sort((a, b) => a.at - b.at)
  const coverageMinutes = usable.length > 1 ? Math.max(0, (usable.at(-1)!.at - usable[0].at) / 60) : 0
  const large = usable.filter(trade => trade.amount >= largeOrderThreshold)
  const totalAmount = usable.reduce((sum, trade) => sum + trade.amount, 0)
  const largeTradeAmount = large.reduce((sum, trade) => sum + trade.amount, 0)
  const netAmount = large.reduce((sum, trade) => sum + (trade.side === 2 ? trade.amount : -trade.amount), 0)
  const largeTradeRatio = totalAmount ? largeTradeAmount / totalAmount : 0
  const observedMinutes = new Set(usable.map(trade => Math.floor(trade.at / 60)))
  const activeMinutes = new Set(large.map(trade => Math.floor(trade.at / 60)))
  const activeMinuteRatio = observedMinutes.size ? activeMinutes.size / observedMinutes.size : 0
  const enough = usable.length >= 20 && coverageMinutes >= 1
  const score = enough ? Math.round(Math.min(100, Math.min(55, largeTradeRatio / .4 * 55) + Math.min(25, large.length / 20 * 25) + activeMinuteRatio * 20)) : null
  const level: InstitutionActivity['level'] = score == null ? '样本不足' : score >= 75 ? '高度活跃' : score >= 50 ? '活跃' : score >= 25 ? '一般' : '偏低'
  const imbalance = largeTradeAmount ? netAmount / largeTradeAmount : 0
  const direction: InstitutionActivity['direction'] = imbalance >= .12 ? 'inflow' : imbalance <= -.12 ? 'outflow' : 'neutral'
  const confidence = enough ? Math.round(Math.min(100, usable.length / 160 * 60 + Math.min(1, coverageMinutes / 10) * 40)) : Math.round(Math.min(35, usable.length / 20 * 35))
  return { score, level, direction, largeTradeAmount, netAmount, largeTradeRatio, largeTradeCount: large.length, activeMinuteRatio, sampleCount: usable.length, coverageMinutes, confidence, threshold: largeOrderThreshold }
}

export function estimateQuantActivity(trades: TradePrint[], market: Market, largeOrderThreshold = 200_000): QuantActivity {
  const factor = market === 'HK' ? 1 : 100
  const usable = trades.filter(trade => trade.side === 1 || trade.side === 2).map(trade => ({ ...trade, at: tradeSeconds(trade.time), amount: trade.price * trade.volume * factor })).filter(trade => Number.isFinite(trade.at) && Number.isFinite(trade.amount) && trade.amount > 0).sort((a, b) => a.at - b.at)
  const coverageMinutes = usable.length > 1 ? Math.max(0, (usable.at(-1)!.at - usable[0].at) / 60) : 0
  const intervals = usable.slice(1).map((trade, index) => Math.max(0, trade.at - usable[index].at))
  const meanInterval = intervals.length ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : 0
  const variance = intervals.length ? intervals.reduce((sum, value) => sum + (value - meanInterval) ** 2, 0) / intervals.length : 0
  const regularity = meanInterval ? 1 / (1 + Math.sqrt(variance) / meanInterval) : 0
  const alternationRatio = usable.length > 1 ? usable.slice(1).filter((trade, index) => trade.side !== usable[index].side).length / (usable.length - 1) : 0
  const smallTradeRatio = usable.length ? usable.filter(trade => trade.amount < largeOrderThreshold).length / usable.length : 0
  const tradesPerMinute = coverageMinutes ? usable.length / coverageMinutes : 0
  const buyAmount = usable.filter(trade => trade.side === 2).reduce((sum, trade) => sum + trade.amount, 0)
  const sellAmount = usable.filter(trade => trade.side === 1).reduce((sum, trade) => sum + trade.amount, 0)
  const orderImbalance = buyAmount + sellAmount ? (buyAmount - sellAmount) / (buyAmount + sellAmount) : 0
  const enough = usable.length >= 30 && coverageMinutes >= 1
  const score = enough ? Math.round(Math.min(100, Math.min(35, tradesPerMinute / 20 * 35) + regularity * 25 + alternationRatio * 25 + smallTradeRatio * 15)) : null
  const level: QuantActivity['level'] = score == null ? '样本不足' : score >= 75 ? '高度活跃' : score >= 50 ? '活跃' : score >= 25 ? '一般' : '偏低'
  const direction: QuantActivity['direction'] = orderImbalance >= .12 ? 'inflow' : orderImbalance <= -.12 ? 'outflow' : 'neutral'
  const confidence = enough ? Math.round(Math.min(100, usable.length / 300 * 65 + Math.min(1, coverageMinutes / 10) * 35)) : Math.round(Math.min(35, usable.length / 30 * 35))
  return { score, level, direction, orderImbalance, tradesPerMinute, regularity, alternationRatio, smallTradeRatio, confidence }
}

export async function fetchHotRank(): Promise<HotRankItem[]> {
  const ranks = await fetchPopularityRows(10)
  const items: WatchItem[] = ranks.map(v => ({ market: String(v.sc).startsWith('SH') ? 'SH' : 'SZ', code: String(v.sc).slice(2), name: String(v.sc) }))
  const quotes = await fetchQuotes(items)
  return quotes.map((quote, i) => ({ ...quote, rank: Number(ranks[i]?.rk ?? i + 1), rankChange: Number(ranks[i]?.hisRc ?? 0) }))
}

async function fetchPopularityRows(pageSize: number): Promise<any[]> {
  const json = await getJson('https://emappdata.eastmoney.com/stockrank/getAllCurrentList', 8000, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ appId: 'appId01', globalId: '786e4c21-70dc-435a-93bb-38', marketType: '', pageNo: 1, pageSize }) })
  return objectRows(json?.data).filter(row => /^(SH|SZ)\d{6}$/.test(String(row.sc)))
}

export async function fetchSectorRank(): Promise<SectorRankItem[]> {
  const load = async (kind: SectorRankItem['kind'], filter: string) => {
    const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=10&po=1&np=1&fltt=2&invt=2&fid=f62&fs=${encodeURIComponent(filter)}&fields=f12,f14,f3,f62,f184`
    const json = await getJson(url); const rows = objectRows(json?.data?.diff)
    return rows.map(row => ({ code: String(row.f12 ?? ''), name: String(row.f14 ?? ''), kind, changePercent: scaled(row.f3, 1), mainNetInflow: scaled(row.f62, 1), mainNetRatio: scaled(row.f184, 1) }))
  }
  const results = await Promise.allSettled([load('industry', 'm:90+t:2'), load('concept', 'm:90+t:3')])
  return results.flatMap(result => result.status === 'fulfilled' ? result.value : []).filter(item => item.name && item.mainNetInflow != null).sort((a, b) => (b.mainNetInflow ?? 0) - (a.mainNetInflow ?? 0)).slice(0, 10)
}

export async function fetchSectorStocks(sector: SectorRankItem): Promise<SectorStockItem[]> {
  const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=100&po=1&np=1&fltt=2&invt=2&fid=f3&fs=${encodeURIComponent(`b:${sector.code}`)}&fields=${fields}`
  const json = await getJson(url); const rows = objectRows(json?.data?.diff); const now = new Date().toISOString()
  const quotes: Quote[] = rows.filter(row => [0, 1].includes(Number(row.f13))).map(row => {
    const market: Market = Number(row.f13) === 1 ? 'SH' : 'SZ'; const code = String(row.f12 ?? '').padStart(6, '0')
    return { market, code, name: String(row.f14 ?? code), price: scaled(row.f2, 1), previousClose: scaled(row.f18, 1), change: scaled(row.f4, 1), changePercent: scaled(row.f3, 1), mainNetInflow: scaled(row.f62, 1), mainNetRatio: scaled(row.f184, 1), superLargeNet: scaled(row.f66, 1), largeNet: scaled(row.f72, 1), amount: scaled(row.f6, 1), volumeRatio: scaled(row.f10, 1), actualTurnoverRate: scaled(row.f8, 1), bid1Price: null, bid1Volume: null, ask1Price: null, ask1Volume: null, updatedAt: quoteTimestamp(row.f124, now), status: 'live' as const }
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
  return objectRows(json?.QuotationCodeTable?.Data).filter((v: any) => ['1', '0', '116'].includes(String(v.MktNum)) && /^\d{1,6}$/.test(String(v.Code)) && typeof v.Name === 'string').map((v: any) => ({ market: marketFromId(Number(v.MktNum), String(v.Code)), code: String(v.Code).padStart(Number(v.MktNum) === 116 ? 5 : 6, '0'), name: v.Name })).slice(0, 8)
}
