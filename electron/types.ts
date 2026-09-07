export type Market = 'SH' | 'SZ' | 'HK'
export interface WatchItem { market: Market; code: string; name: string; hidden?: boolean; costPrice?: number; holdingLots?: number; lotSize?: number }
export interface TrendPoint { time: string; value: number }
export interface TradePrint { time: string; price: number; volume: number; side: 1 | 2 | 4 }
export interface SplitSignal { side: 'buy' | 'sell'; startTime: string; endTime: string; tradeCount: number; totalAmount: number; confidence: number }
export interface SplitEstimate { buyAmount: number; sellAmount: number; netAmount: number; signals: SplitSignal[]; updatedAt: string }
export interface KlinePoint { date: string; open: number; close: number; high: number; low: number; volume: number; amount: number }
export interface Quote { market: Market; code: string; name: string; price: number | null; previousClose: number | null; change: number | null; changePercent: number | null; mainNetInflow: number | null; mainNetRatio: number | null; superLargeNet: number | null; largeNet: number | null; amount: number | null; volumeRatio: number | null; actualTurnoverRate: number | null; updatedAt: string; status: 'live' | 'delayed' | 'offline' }
export interface DetailData { price: TrendPoint[]; averagePrice: TrendPoint[]; capital: TrendPoint[]; minuteCapital: TrendPoint[]; flow5m: number | null; flow10m: number | null; klines: KlinePoint[]; splitSignals: SplitSignal[]; splitEstimate: SplitEstimate; updatedAt: string }
export interface HotRankItem extends Quote { rank: number; rankChange: number }
export interface SectorRankItem { code: string; name: string; kind: 'industry' | 'concept'; changePercent: number | null; mainNetInflow: number | null; mainNetRatio: number | null }
export interface PriceAlert { id: string; secid: string; metric: 'priceAbove' | 'priceBelow' | 'changeAbove' | 'changeBelow'; threshold: number; enabled: boolean; lastTriggered?: number }
export interface TodoItem { id: string; text: string; tag: string; completed: boolean; createdAt: string; completedAt?: string }
export interface TodoLog { id: string; savedAt: string; items: TodoItem[] }
export interface Settings { refreshMs: number; idleRefreshMs: number; opacity: number; theme: 'dark' | 'light'; colorMode: 'cn' | 'global'; tickerShortcut: string; notesShortcut: string; hideShortcut: string; notifications: boolean; smartAlerts: boolean; launchAtLogin: boolean; locked: boolean; paused: boolean; commissionRate: number; minimumCommission: number; stampDutyRate: number }
export interface AppState { watchlist: WatchItem[]; alerts: PriceAlert[]; todos: string; todoItems: TodoItem[]; todoLogs: TodoLog[]; settings: Settings; windowBounds?: Electron.Rectangle }
export interface SearchResult { market: Market; code: string; name: string }
