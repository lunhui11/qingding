export type Market = 'SH' | 'SZ' | 'HK'
export interface WatchItem { market: Market; code: string; name: string; hidden?: boolean; costPrice?: number; holdingLots?: number; lotSize?: number }
export interface TrendPoint { time: string; value: number }
export interface IntradayPoint { time: string; open: number; close: number; high: number; low: number; volume: number; amount: number; average: number }
export interface TradePrint { time: string; price: number; volume: number; side: 1 | 2 | 4 }
export interface InstitutionActivity { score: number | null; level: '样本不足' | '偏低' | '一般' | '活跃' | '高度活跃'; direction: 'inflow' | 'outflow' | 'neutral'; largeTradeAmount: number; netAmount: number; largeTradeRatio: number; largeTradeCount: number; activeMinuteRatio: number; sampleCount: number; coverageMinutes: number; confidence: number; threshold: number }
export interface QuantActivity { score: number | null; level: '样本不足' | '偏低' | '一般' | '活跃' | '高度活跃'; direction: 'inflow' | 'outflow' | 'neutral'; orderImbalance: number; tradesPerMinute: number; regularity: number; alternationRatio: number; smallTradeRatio: number; confidence: number }
export interface KlinePoint { date: string; open: number; close: number; high: number; low: number; volume: number; amount: number }
export interface Quote { market: Market; code: string; name: string; price: number | null; previousClose: number | null; change: number | null; changePercent: number | null; mainNetInflow: number | null; mainNetRatio: number | null; superLargeNet: number | null; largeNet: number | null; amount: number | null; volumeRatio: number | null; actualTurnoverRate: number | null; bid1Price: number | null; bid1Volume: number | null; ask1Price: number | null; ask1Volume: number | null; updatedAt: string; status: 'live' | 'delayed' | 'offline' }
export interface DetailData { intraday: IntradayPoint[]; price: TrendPoint[]; averagePrice: TrendPoint[]; capital: TrendPoint[]; minuteCapital: TrendPoint[]; trades: TradePrint[]; institutionActivity: InstitutionActivity; quantActivity: QuantActivity; flow5m: number | null; flow10m: number | null; flow5mTradeCount: number; flow10mTradeCount: number; flowCoverageMinutes: number; klines: KlinePoint[]; updatedAt: string; tradeDate?: string; book?: Pick<Quote, 'bid1Price' | 'bid1Volume' | 'ask1Price' | 'ask1Volume' | 'updatedAt'> }
export interface HotRankItem extends Quote { rank: number; rankChange: number }
export interface SectorRankItem { code: string; name: string; kind: 'industry' | 'concept'; changePercent: number | null; mainNetInflow: number | null; mainNetRatio: number | null }
export type SectorLeaderLabel = '涨幅龙头' | '人气龙头' | '资金龙头'
export interface SectorStockItem extends Quote { leaderLabels: SectorLeaderLabel[]; popularityRank: number | null }
export interface PriceAlert { id: string; secid: string; metric: 'priceAbove' | 'priceBelow' | 'changeAbove' | 'changeBelow'; threshold: number; enabled: boolean; lastTriggered?: number }
export type WatchSortMode = 'manual' | 'change' | 'mainFlow' | 'flow5m' | 'flow10m' | 'volumeRatio' | 'profit'
export interface TodoItem { id: string; text: string; tag: string; completed: boolean; createdAt: string; completedAt?: string }
export interface TodoLog { id: string; savedAt: string; items: TodoItem[] }
export interface Settings { refreshMs: number; idleRefreshMs: number; opacity: number; theme: 'dark' | 'light'; colorMode: 'cn' | 'global'; tickerShortcut: string; notesShortcut: string; hideShortcut: string; notifications: boolean; launchAtLogin: boolean; locked: boolean; paused: boolean; commissionRate: number; minimumCommission: number; stampDutyRate: number; compactMode: boolean; positionsFirst: boolean; watchSortMode: WatchSortMode; largeOrderThreshold: number }
export interface AppState { watchlist: WatchItem[]; alerts: PriceAlert[]; todos: string; todoItems: TodoItem[]; todoLogs: TodoLog[]; settings: Settings; windowBounds?: Electron.Rectangle }
export interface SearchResult { market: Market; code: string; name: string }
