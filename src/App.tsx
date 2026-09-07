import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Bell, ChevronDown, ChevronUp, Eye, EyeOff, Flame, Moon, Pause, Play, Plus, Search, Sun, Trash2, X } from 'lucide-react'
import type { AppState, DetailData, HotRankItem, PriceAlert, Quote, SearchResult, SplitEstimate, TodoItem, TodoLog, WatchItem } from './types'
import { alertTriggered, directionClass, displayMarket, fmtMoney, fmtPrice, isTradingTime, secid, smartSignal } from './utils'
import Sparkline from './components/Sparkline'
import TitleBar from './components/TitleBar'
import Decoy from './components/Decoy'
import SettingsPanel from './components/SettingsPanel'
import Candlestick from './components/Candlestick'

const fallbackState: AppState = { watchlist: [], alerts: [], todos: '', todoItems: [], todoLogs: [], settings: { refreshMs: 1000, idleRefreshMs: 15000, opacity: .96, theme: 'dark', colorMode: 'cn', tickerShortcut: 'F8', notesShortcut: 'F7', hideShortcut: 'F9', notifications: true, smartAlerts: true, launchAtLogin: false, locked: false, paused: false } }

export default function App() {
  const [state, setState] = useState<AppState>(fallbackState)
  const [quotes, setQuotes] = useState<Record<string, Quote>>({})
  const [details, setDetails] = useState<Record<string, DetailData>>({})
  const [expanded, setExpanded] = useState<string>()
  const [decoy, setDecoy] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [alertFor, setAlertFor] = useState<string>()
  const [hotOpen, setHotOpen] = useState(false)
  const [hotRanks, setHotRanks] = useState<HotRankItem[]>([])
  const [splits, setSplits] = useState<Record<string, SplitEstimate>>({})
  const [lastUpdated, setLastUpdated] = useState<Date>()
  const [networkError, setNetworkError] = useState(false)
  const [shortcutError, setShortcutError] = useState<string>()
  const busy = useRef(false)
  const detailBusy = useRef(false)
  const splitBusy = useRef(false)
  const splitCursor = useRef(0)
  const quotesRef = useRef<Record<string, Quote>>({})
  const smartAlertTimes = useRef<Record<string, number>>({})
  const previousTriggers = useRef<Record<string, boolean>>({})

  useEffect(() => { window.marketFloat.loadState().then(setState); return window.marketFloat.onDecoyChanged(value => { setDecoy(value); window.marketFloat.loadState().then(setState) }) }, [])
  const save = useCallback(async (patch: Partial<AppState>) => setState(await window.marketFloat.saveState(patch)), [])
  useEffect(() => { quotesRef.current = quotes }, [quotes])

  const checkAlerts = useCallback((incoming: Quote[]) => {
    if (!state.settings.notifications) return
    const now = Date.now()
    for (const alert of state.alerts.filter(a => a.enabled)) {
      const quote = incoming.find(q => secid(q) === alert.secid); if (!quote) continue
      const active = alertTriggered(alert, quote); const wasActive = previousTriggers.current[alert.id]
      if (active && !wasActive && (!alert.lastTriggered || now - alert.lastTriggered > 300_000)) {
        const unit = alert.metric.startsWith('price') ? '' : '%'
        window.marketFloat.notify(`${quote.name} 触发提醒`, `${alert.metric.includes('Above') ? '已达到' : '已跌至'} ${alert.threshold}${unit}`)
        alert.lastTriggered = now; save({ alerts: [...state.alerts] })
      }
      previousTriggers.current[alert.id] = active
    }
  }, [state.alerts, state.settings.notifications, save])

  const refresh = useCallback(async () => {
    if (busy.current || state.settings.paused || !state.watchlist.length) return
    busy.current = true
    try {
      const incoming = await window.marketFloat.fetchQuotes(state.watchlist.filter(v => !v.hidden))
      setQuotes(old => ({ ...old, ...Object.fromEntries(incoming.map(v => [secid(v), v])) })); setLastUpdated(new Date()); setNetworkError(false); checkAlerts(incoming)
    } catch { setNetworkError(true); setQuotes(old => Object.fromEntries(Object.entries(old).map(([k, v]) => [k, { ...v, status: 'delayed' }]))) }
    finally { busy.current = false }
  }, [state.watchlist, state.settings.paused, checkAlerts])

  useEffect(() => {
    refresh()
    const chooseDelay = () => decoy || document.hidden ? state.settings.idleRefreshMs : isTradingTime() ? state.settings.refreshMs : 60_000
    let timer = window.setTimeout(function tick() { refresh(); timer = window.setTimeout(tick, chooseDelay()) }, chooseDelay())
    return () => clearTimeout(timer)
  }, [refresh, decoy, state.settings.refreshMs, state.settings.idleRefreshMs])

  useEffect(() => {
    if (!expanded || decoy) return
    const item = state.watchlist.find(v => secid(v) === expanded); if (!item) return
    const load = async () => { if (detailBusy.current) return; detailBusy.current = true; try { const loaded = await window.marketFloat.fetchDetail(item); setDetails(old => { const previous = old[expanded]; return { ...old, [expanded]: { ...loaded, price: loaded.price.length ? loaded.price : previous?.price ?? [], klines: loaded.klines.length ? loaded.klines : previous?.klines ?? [], capital: loaded.capital.length ? loaded.capital : previous?.capital ?? [] } } }); setSplits(old => ({ ...old, [expanded]: loaded.splitEstimate })) } finally { detailBusy.current = false } }
    load(); const timer = window.setInterval(load, Math.max(1000, state.settings.refreshMs)); return () => clearInterval(timer)
  }, [expanded, decoy, state.watchlist, state.settings.refreshMs])

  useEffect(() => {
    if (decoy || state.settings.paused) return
    const loadNext = async () => { const visible = state.watchlist.filter(v => !v.hidden).slice(0, 12); if (!visible.length || splitBusy.current) return; const item = visible[splitCursor.current++ % visible.length]; const id = secid(item); splitBusy.current = true; try { const estimate = await window.marketFloat.fetchSplitEstimate(item); setSplits(old => ({ ...old, [id]: estimate })); const signal = smartSignal(quotesRef.current[id], estimate); const now = Date.now(); if (signal && state.settings.notifications && state.settings.smartAlerts && now - (smartAlertTimes.current[id] ?? 0) > 900_000) { const q = quotesRef.current[id]; window.marketFloat.notify(`${q?.name || item.name} · 资金${signal === 'inflow' ? '流入' : '流出'}共振`, `量比 ${q?.volumeRatio?.toFixed(2)}，明盘与拆单估算同向${signal === 'inflow' ? '流入' : '流出'}`); smartAlertTimes.current[id] = now } } catch { /* retain the last valid estimate */ } finally { splitBusy.current = false } }
    loadNext(); const timer = window.setInterval(loadNext, 1000); return () => clearInterval(timer)
  }, [decoy, state.settings.paused, state.settings.notifications, state.settings.smartAlerts, state.watchlist])

  useEffect(() => { if (hotOpen) window.marketFloat.fetchHotRank().then(setHotRanks).catch(() => setHotRanks([])) }, [hotOpen])

  const toggleDetail = (item: WatchItem) => {
    const id = secid(item); if (expanded === id) return setExpanded(undefined)
    setExpanded(id)
  }
  const updateSettings = async (settings: AppState['settings']) => {
    setState(s => ({ ...s, settings })); await save({ settings }); window.marketFloat.setWindowOpacity(settings.opacity); window.marketFloat.setWindowLocked(settings.locked); window.marketFloat.setLaunchAtLogin(settings.launchAtLogin)
    const result = await window.marketFloat.updateShortcut(settings.tickerShortcut, settings.notesShortcut, settings.hideShortcut); setShortcutError(result.error)
  }
  const status = state.settings.paused ? '已暂停' : networkError ? '连接异常' : lastUpdated ? `${lastUpdated.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })} 更新` : '正在连接'
  const signalSummary = useMemo(() => state.watchlist.filter(v => !v.hidden).reduce((sum, item) => { const signal = smartSignal(quotes[secid(item)], splits[secid(item)]); if (signal) sum[signal]++; return sum }, { inflow: 0, outflow: 0 }), [state.watchlist, quotes, splits])

  if (decoy) return <Decoy items={state.todoItems} logs={state.todoLogs} tickerShortcut={state.settings.tickerShortcut} onItemsChange={(todoItems: TodoItem[]) => save({ todoItems })} onLogsChange={(todoLogs: TodoLog[]) => save({ todoLogs })} onSaveLog={(log: TodoLog) => save({ todoLogs: [log, ...state.todoLogs].slice(0, 180) })}/>
  return <div className="app-shell" data-theme={state.settings.theme}>
    <TitleBar locked={state.settings.locked} status={status} onLock={() => updateSettings({ ...state.settings, locked: !state.settings.locked })} onSettings={() => setSettingsOpen(true)} onHide={() => window.marketFloat.hideWindow()}/>
    <div className="toolbar">
      <div><span className="eyebrow">WATCHLIST</span><h1>自选行情</h1></div>
      <div className="tool-actions"><button title={state.settings.theme === 'dark' ? '切换亮色' : '切换暗色'} onClick={() => updateSettings({ ...state.settings, theme: state.settings.theme === 'dark' ? 'light' : 'dark' })}>{state.settings.theme === 'dark' ? <Sun size={16}/> : <Moon size={16}/>}</button><button title="热度榜 TOP 10" onClick={() => setHotOpen(true)}><Flame size={16}/></button><button className={state.settings.paused ? 'active' : ''} title={state.settings.paused ? '继续刷新' : '暂停刷新'} onClick={() => updateSettings({ ...state.settings, paused: !state.settings.paused })}>{state.settings.paused ? <Play size={16}/> : <Pause size={16}/>}</button><button className="add" onClick={() => setAddOpen(true)}><Plus size={17}/><span>添加</span></button></div>
    </div>
    {!!state.watchlist.filter(v => !v.hidden).length && <div className="scan-summary"><span><Activity size={12}/>智能扫描</span><b className="rise">流入共振 {signalSummary.inflow}</b><b className="fall">流出共振 {signalSummary.outflow}</b></div>}
    <div className="column-head"><span>标的 / 资金动向</span><span>最新 / 涨跌</span></div>
    <section className="watchlist">
      {state.watchlist.filter(v => !v.hidden).map(item => {
        const id = secid(item); const q = quotes[id]; const split = splits[id]; const change = q?.changePercent ?? null; const open = expanded === id; const detail = details[id]; const signal = smartSignal(q, split)
        return <article className={`stock-card ${open ? 'expanded' : ''}`} key={id}>
          <button className="stock-main" onClick={() => toggleDetail(item)}>
            <div className="identity"><div><span className="market-badge">{displayMarket(item.market)}</span><b>{q?.name || item.name}</b></div><small>{item.code}</small><div className={`capital ${directionClass(q?.mainNetInflow ?? null, state.settings)}`}><span>明盘</span>{fmtMoney(q?.mainNetInflow ?? null)}<em className={directionClass(split?.netAmount ?? null, state.settings)}>暗盘 {split ? fmtMoney(split.netAmount) : '扫描中'}</em></div><div className="signal-chips">{signal && <i className={`signal-chip resonance ${directionClass(signal === 'inflow' ? 1 : -1, state.settings)}`}>{signal === 'inflow' ? '流入共振' : '流出共振'}</i>}{(q?.volumeRatio ?? 0) >= 2 && <i className="signal-chip hot">量比放大</i>}{split && Math.abs(split.netAmount) >= 2_000_000 && <i className="signal-chip">疑似拆单</i>}</div></div>
            <div className="quote"><b>{fmtPrice(q?.price ?? null)}</b><span className={directionClass(change, state.settings)}>{change == null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(2)}%`}</span></div>
            {open ? <ChevronUp className="chevron" size={14}/> : <ChevronDown className="chevron" size={14}/>} 
          </button>
          {open && <div className="detail">
            <div className="chart-block"><header><span>30 日 K 线</span><span>{detail?.klines.at(-1)?.date ?? '加载中'}</span></header><Candlestick points={detail?.klines ?? []}/></div>
            <div className="metric-grid"><div><span>成交额</span><b>{fmtMoney(q?.amount ?? null).replace('+','')}</b></div><div><span>量比</span><b>{q?.volumeRatio == null ? '—' : q.volumeRatio.toFixed(2)}</b></div><div><span>实际换手率</span><b>{q?.actualTurnoverRate == null ? '—' : `${q.actualTurnoverRate.toFixed(2)}%`}</b></div></div>
            <div className="chart-block"><header><span>{detail?.price.length ? '今日分时' : '收盘走势（分时暂缺）'}</span><span>{detail?.price.at(-1)?.time?.slice(-5) ?? detail?.klines.at(-1)?.date ?? '加载中'}</span></header><Sparkline points={detail?.price.length ? detail.price : detail?.klines.map(v => ({ time: v.date, value: v.close })) ?? []} positive={(change ?? 0) >= 0}/></div>
            <div className="chart-block"><header><span>近 20 日主力资金</span><span>{item.market === 'HK' ? '趋势暂无数据' : fmtMoney(q?.mainNetInflow ?? null)}</span></header><Sparkline points={detail?.capital ?? []} positive={(q?.mainNetInflow ?? 0) >= 0}/></div>
            <div className="breakdown"><span>超大单 <b className={directionClass(q?.superLargeNet ?? null, state.settings)}>{fmtMoney(q?.superLargeNet ?? null)}</b></span><span>大单 <b className={directionClass(q?.largeNet ?? null, state.settings)}>{fmtMoney(q?.largeNet ?? null)}</b></span></div>
            <div className="split-radar"><header><span>暗盘 · 疑似拆单</span><small>算法推测 · 逐笔扫描</small></header><div className="split-summary"><span>拆单买入 <b className={directionClass(1,state.settings)}>{fmtMoney(detail?.splitEstimate.buyAmount ?? 0)}</b></span><span>拆单卖出 <b className={directionClass(-1,state.settings)}>{fmtMoney(-(detail?.splitEstimate.sellAmount ?? 0))}</b></span></div>{detail?.splitSignals?.length ? detail.splitSignals.map(signal => <div className={`split-signal ${signal.side === 'buy' ? directionClass(1, state.settings) : directionClass(-1, state.settings)}`} key={signal.side}><b>{signal.side === 'buy' ? '疑似拆单买入' : '疑似拆单卖出'}</b><span>{fmtMoney(signal.totalAmount)} · {signal.tradeCount} 笔</span><em>置信度 {signal.confidence}%</em></div>) : <p>最近逐笔成交中暂无明显拆单信号</p>}</div>
            <div className="detail-actions"><button onClick={() => setAlertFor(id)}><Bell size={14}/>提醒</button><button onClick={() => save({ watchlist: state.watchlist.map(v => secid(v) === id ? { ...v, hidden: true } : v) })}><EyeOff size={14}/>隐藏</button><button className="danger" onClick={() => save({ watchlist: state.watchlist.filter(v => secid(v) !== id) })}><Trash2 size={14}/>删除</button></div>
          </div>}
        </article>
      })}
      {!state.watchlist.filter(v => !v.hidden).length && <div className="empty"><Eye size={26}/><b>还没有自选标的</b><span>添加股票后，会在这里低调刷新</span><button onClick={() => setAddOpen(true)}>添加第一只</button></div>}
    </section>
    <footer className="app-footer"><span className={networkError ? 'warn' : ''}><i/>{networkError ? '数据延迟' : state.settings.paused ? '刷新已暂停' : `${isTradingTime() ? state.settings.refreshMs / 1000 : 60} 秒刷新`}</span><span>主力 = 大单 + 超大单净额</span></footer>
    {settingsOpen && <SettingsPanel value={state.settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} shortcutError={shortcutError}/>} 
    {addOpen && <AddStock state={state} onSave={save} onClose={() => setAddOpen(false)}/>} 
    {hotOpen && <HotRankPanel items={hotRanks} state={state} onSave={save} onClose={() => setHotOpen(false)}/>} 
    {alertFor && <AlertEditor stock={state.watchlist.find(v => secid(v) === alertFor)!} alerts={state.alerts.filter(a => a.secid === alertFor)} onSave={alerts => save({ alerts: [...state.alerts.filter(a => a.secid !== alertFor), ...alerts] })} onClose={() => setAlertFor(undefined)}/>} 
  </div>
}

function AddStock({ state, onSave, onClose }: { state: AppState; onSave(p: Partial<AppState>): void; onClose(): void }) {
  const [query, setQuery] = useState(''); const [results, setResults] = useState<SearchResult[]>([]); const [loading, setLoading] = useState(false); const timer = useRef<number | undefined>(undefined)
  const search = (value: string) => { setQuery(value); clearTimeout(timer.current); if (!value.trim()) return setResults([]); timer.current = window.setTimeout(async () => { setLoading(true); try { setResults(await window.marketFloat.searchStocks(value)) } finally { setLoading(false) } }, 300) }
  const add = (item: SearchResult) => { const exists = state.watchlist.some(v => secid(v) === secid(item)); const list = exists ? state.watchlist.map(v => secid(v) === secid(item) ? { ...v, hidden: false, name: item.name } : v) : [...state.watchlist, item]; onSave({ watchlist: list }); onClose() }
  return <div className="overlay"><section className="panel add-panel"><div className="panel-head"><h2>添加自选</h2><button onClick={onClose}><X size={18}/></button></div><div className="searchbox"><Search size={16}/><input autoFocus value={query} onChange={e => search(e.target.value)} placeholder="输入名称、600519、HK00700"/></div><div className="results">{loading && <p>搜索中…</p>}{results.map(v => <button key={secid(v)} onClick={() => add(v)}><span className="market-badge">{displayMarket(v.market)}</span><b>{v.name}</b><small>{v.code}</small><Plus size={16}/></button>)}{query && !loading && !results.length && <p>未找到匹配标的</p>}</div><p className="fineprint">支持沪深 6 位代码，以及 HK + 港股代码。</p></section></div>
}

function HotRankPanel({ items, state, onSave, onClose }: { items: HotRankItem[]; state: AppState; onSave(p: Partial<AppState>): void; onClose(): void }) {
  const add = (item: HotRankItem) => { if (state.watchlist.some(v => secid(v) === secid(item))) return; onSave({ watchlist: [...state.watchlist, { market: item.market, code: item.code, name: item.name }] }) }
  return <div className="overlay"><section className="panel hot-panel"><div className="panel-head"><div><small>A 股实时人气</small><h2>热度排行榜 TOP 10</h2></div><button onClick={onClose}><X size={18}/></button></div><div className="hot-list">{items.length ? items.map(item => { const added = state.watchlist.some(v => secid(v) === secid(item)); return <div key={secid(item)}><strong>{item.rank}</strong><span><b>{item.name}</b><small>{item.code}</small></span><em className={directionClass(item.changePercent, state.settings)}>{item.changePercent == null ? '—' : `${item.changePercent > 0 ? '+' : ''}${item.changePercent.toFixed(2)}%`}</em><button disabled={added} onClick={() => add(item)}>{added ? '已添加' : '+ 自选'}</button></div>}) : <p>热度数据加载中或暂时不可用</p>}</div><p className="fineprint">热度排名来自公开行情源，仅反映关注度，不代表买卖建议。</p></section></div>
}

function AlertEditor({ stock, alerts, onSave, onClose }: { stock: WatchItem; alerts: PriceAlert[]; onSave(v: PriceAlert[]): void; onClose(): void }) {
  const [metric, setMetric] = useState<PriceAlert['metric']>('priceAbove'); const [threshold, setThreshold] = useState(''); const [rules, setRules] = useState(alerts)
  const persist = (next: PriceAlert[]) => { setRules(next); onSave(next) }
  const add = () => { const n = Number(threshold); if (!Number.isFinite(n) || !threshold) return; persist([...rules, { id: crypto.randomUUID(), secid: secid(stock), metric, threshold: n, enabled: true }]); setThreshold('') }
  return <div className="overlay"><section className="panel alert-panel"><div className="panel-head"><div><small>{stock.code}</small><h2>{stock.name} · 提醒</h2></div><button onClick={onClose}><X size={18}/></button></div><div className="alert-form"><select value={metric} onChange={e => setMetric(e.target.value as PriceAlert['metric'])}><option value="priceAbove">价格高于</option><option value="priceBelow">价格低于</option><option value="changeAbove">涨跌幅高于</option><option value="changeBelow">涨跌幅低于</option></select><input type="number" step="0.01" value={threshold} onChange={e => setThreshold(e.target.value)} placeholder="阈值"/><button onClick={add}>添加提醒</button></div>{rules.length > 0 && <div className="existing-alerts">{rules.map(a => <div key={a.id}><input type="checkbox" checked={a.enabled} onChange={e => persist(rules.map(v => v.id === a.id ? { ...v, enabled: e.target.checked } : v))}/><span>{a.metric.includes('price') ? '价格' : '涨跌幅'} {a.metric.includes('Above') ? '≥' : '≤'} {a.threshold}{a.metric.includes('change') ? '%' : ''}</span><button onClick={() => persist(rules.filter(v => v.id !== a.id))}><Trash2 size={13}/></button></div>)}</div>}<p className="fineprint">条件从未满足变为满足时提醒，5 分钟内不会重复通知。</p></section></div>
}
