export type Market = 'SH' | 'SZ' | 'HK'
export interface WatchItem { market: Market; code: string; name: string; hidden?: boolean }
export interface TrendPoint { time: string; value: number }
export interface SplitSignal { side: 'buy' | 'sell'; startTime: string; endTime: string; tradeCount: number; totalAmount: number; confidence: number }
export interface Quote {
  market: Market; code: string; name: string; price: number | null; previousClose: number | null;
  change: number | null; changePercent: number | null; mainNetInflow: number | null; mainNetRatio: number | null;
  superLargeNet: number | null; largeNet: number | null; updatedAt: string; status: 'live' | 'delayed' | 'offline';
}
export interface DetailData { price: TrendPoint[]; capital: TrendPoint[]; splitSignals: SplitSignal[]; updatedAt: string }
export type AlertMetric = 'priceAbove' | 'priceBelow' | 'changeAbove' | 'changeBelow'
export interface PriceAlert { id: string; secid: string; metric: AlertMetric; threshold: number; enabled: boolean; lastTriggered?: number }
export interface TodoItem { id: string; text: string; tag: string; completed: boolean; createdAt: string; completedAt?: string }
export interface TodoLog { id: string; savedAt: string; items: TodoItem[] }
export interface Settings {
  refreshMs: number; idleRefreshMs: number; opacity: number; colorMode: 'cn' | 'global'; tickerShortcut: string; notesShortcut: string; hideShortcut: string;
  notifications: boolean; launchAtLogin: boolean; locked: boolean; paused: boolean;
}
export interface AppState { watchlist: WatchItem[]; alerts: PriceAlert[]; todos: string; todoItems: TodoItem[]; todoLogs: TodoLog[]; settings: Settings; windowBounds?: { x: number; y: number; width: number; height: number } }
export interface SearchResult { market: Market; code: string; name: string }

export interface MarketFloatAPI {
  loadState(): Promise<AppState>; saveState(patch: Partial<AppState>): Promise<AppState>;
  fetchQuotes(items: WatchItem[]): Promise<Quote[]>; fetchDetail(item: WatchItem): Promise<DetailData>;
  searchStocks(query: string): Promise<SearchResult[]>; toggleDecoy(): Promise<boolean>; setDecoy(value: boolean): Promise<boolean>;
  setWindowOpacity(value: number): Promise<void>; setWindowLocked(value: boolean): Promise<void>;
  updateShortcut(tickerValue: string, notesValue: string, hideValue: string): Promise<{ ok: boolean; error?: string }>; setLaunchAtLogin(value: boolean): Promise<void>;
  notify(title: string, body: string): Promise<void>; hideWindow(): Promise<void>; quit(): Promise<void>;
  onDecoyChanged(callback: (value: boolean) => void): () => void;
}

declare global { interface Window { marketFloat: MarketFloatAPI } }
