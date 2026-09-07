export type Market = 'SH' | 'SZ' | 'HK'
export interface WatchItem { market: Market; code: string; name: string; hidden?: boolean }
export interface TrendPoint { time: string; value: number }
export interface Quote { market: Market; code: string; name: string; price: number | null; previousClose: number | null; change: number | null; changePercent: number | null; mainNetInflow: number | null; mainNetRatio: number | null; superLargeNet: number | null; largeNet: number | null; updatedAt: string; status: 'live' | 'delayed' | 'offline' }
export interface DetailData { price: TrendPoint[]; capital: TrendPoint[]; updatedAt: string }
export interface PriceAlert { id: string; secid: string; metric: 'priceAbove' | 'priceBelow' | 'changeAbove' | 'changeBelow'; threshold: number; enabled: boolean; lastTriggered?: number }
export interface Settings { refreshMs: number; idleRefreshMs: number; opacity: number; colorMode: 'cn' | 'global'; shortcut: string; notifications: boolean; launchAtLogin: boolean; locked: boolean; paused: boolean }
export interface AppState { watchlist: WatchItem[]; alerts: PriceAlert[]; todos: string; settings: Settings; windowBounds?: Electron.Rectangle }
export interface SearchResult { market: Market; code: string; name: string }
