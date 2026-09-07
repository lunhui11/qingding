import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bell, ChevronDown, ChevronUp, Eye, EyeOff, Pause, Play, Plus, Search, Trash2, X } from 'lucide-react'
import type { AppState, DetailData, PriceAlert, Quote, SearchResult, WatchItem } from './types'
import { alertTriggered, directionClass, displayMarket, fmtMoney, fmtPrice, isTradingTime, secid } from './utils'
import Sparkline from './components/Sparkline'
import TitleBar from './components/TitleBar'
import Decoy from './components/Decoy'
import SettingsPanel from './components/SettingsPanel'

const fallbackState: AppState = { watchlist: [], alerts: [], todos: '', settings: { refreshMs: 3000, idleRefreshMs: 15000, opacity: .96, colorMode: 'cn', shortcut: 'CommandOrControl+Alt+M', notifications: true, launchAtLogin: false, locked: false, paused: false } }

export default function App() {
  const [state, setState] = useState<AppState>(fallbackState)
  const [quotes, setQuotes] = useState<Record<string, Quote>>({})
  const [details, setDetails] = useState<Record<string, DetailData>>({})
  const [expanded, setExpanded] = useState<string>()
  const [decoy, setDecoy] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [alertFor, setAlertFor] = useState<string>()
  const [lastUpdated, setLastUpdated] = useState<Date>()
  const [networkError, setNetworkError] = useState(false)
  const [shortcutError, setShortcutError] = useState<string>()
  const busy = useRef(false)
  const previousTriggers = useRef<Record<string, boolean>>({})

  useEffect(() => { window.marketFloat.loadState().then(setState); return window.marketFloat.onDecoyChanged(value => { setDecoy(value); window.marketFloat.loadState().then(setState) }) }, [])
  const save = useCallback(async (patch: Partial<AppState>) => setState(await window.marketFloat.saveState(patch)), [])

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

  const toggleDetail = async (item: WatchItem) => {
    const id = secid(item); if (expanded === id) return setExpanded(undefined)
    setExpanded(id); try { const loaded = await window.marketFloat.fetchDetail(item); setDetails(old => ({ ...old, [id]: loaded })) } catch { /* inline empty state */ }
  }
  const updateSettings = async (settings: AppState['settings']) => {
    setState(s => ({ ...s, settings })); await save({ settings }); window.marketFloat.setWindowOpacity(settings.opacity); window.marketFloat.setWindowLocked(settings.locked); window.marketFloat.setLaunchAtLogin(settings.launchAtLogin)
    const result = await window.marketFloat.updateShortcut(settings.shortcut); setShortcutError(result.error)
  }
  const status = state.settings.paused ? '已暂停' : networkError ? '连接异常' : lastUpdated ? `${lastUpdated.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })} 更新` : '正在连接'

  if (decoy) return <Decoy value={state.todos} onChange={value => { setState(s => ({ ...s, todos: value })); save({ todos: value }) }} onRestore={() => window.marketFloat.setDecoy(false).then(setDecoy)}/>
  return <div className="app-shell">
    <TitleBar locked={state.settings.locked} status={status} onLock={() => updateSettings({ ...state.settings, locked: !state.settings.locked })} onSettings={() => setSettingsOpen(true)} onDecoy={() => window.marketFloat.setDecoy(true).then(setDecoy)} onHide={() => window.marketFloat.hideWindow()}/>
    <div className="toolbar">
      <div><span className="eyebrow">WATCHLIST</span><h1>自选行情</h1></div>
      <div className="tool-actions"><button className={state.settings.paused ? 'active' : ''} title={state.settings.paused ? '继续刷新' : '暂停刷新'} onClick={() => updateSettings({ ...state.settings, paused: !state.settings.paused })}>{state.settings.paused ? <Play size={16}/> : <Pause size={16}/>}</button><button className="add" onClick={() => setAddOpen(true)}><Plus size={17}/><span>添加</span></button></div>
    </div>
    <div className="column-head"><span>标的 / 资金动向</span><span>最新 / 涨跌</span></div>
    <section className="watchlist">
      {state.watchlist.filter(v => !v.hidden).map(item => {
        const id = secid(item); const q = quotes[id]; const change = q?.changePercent ?? null; const open = expanded === id; const detail = details[id]
        return <article className={`stock-card ${open ? 'expanded' : ''}`} key={id}>
          <button className="stock-main" onClick={() => toggleDetail(item)}>
            <div className="identity"><div><span className="market-badge">{displayMarket(item.market)}</span><b>{q?.name || item.name}</b></div><small>{item.code}</small><div className={`capital ${directionClass(q?.mainNetInflow ?? null, state.settings)}`}><span>主力</span>{fmtMoney(q?.mainNetInflow ?? null)}{q?.mainNetRatio != null && <em>{q.mainNetRatio > 0 ? '+' : ''}{q.mainNetRatio.toFixed(2)}%</em>}</div></div>
            <div className="quote"><b>{fmtPrice(q?.price ?? null)}</b><span className={directionClass(change, state.settings)}>{change == null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(2)}%`}</span></div>
            {open ? <ChevronUp className="chevron" size={14}/> : <ChevronDown className="chevron" size={14}/>} 
          </button>
          {open && <div className="detail">
            <div className="chart-block"><header><span>今日分时</span><span>{detail?.price.at(-1)?.time?.slice(-5) ?? '加载中'}</span></header><Sparkline points={detail?.price ?? []} positive={(change ?? 0) >= 0}/></div>
            <div className="chart-block"><header><span>近 20 日主力资金</span><span>{item.market === 'HK' ? '趋势暂无数据' : fmtMoney(q?.mainNetInflow ?? null)}</span></header><Sparkline points={detail?.capital ?? []} positive={(q?.mainNetInflow ?? 0) >= 0}/></div>
            <div className="breakdown"><span>超大单 <b className={directionClass(q?.superLargeNet ?? null, state.settings)}>{fmtMoney(q?.superLargeNet ?? null)}</b></span><span>大单 <b className={directionClass(q?.largeNet ?? null, state.settings)}>{fmtMoney(q?.largeNet ?? null)}</b></span></div>
            <div className="detail-actions"><button onClick={() => setAlertFor(id)}><Bell size={14}/>提醒</button><button onClick={() => save({ watchlist: state.watchlist.map(v => secid(v) === id ? { ...v, hidden: true } : v) })}><EyeOff size={14}/>隐藏</button><button className="danger" onClick={() => save({ watchlist: state.watchlist.filter(v => secid(v) !== id) })}><Trash2 size={14}/>删除</button></div>
          </div>}
        </article>
      })}
      {!state.watchlist.filter(v => !v.hidden).length && <div className="empty"><Eye size={26}/><b>还没有自选标的</b><span>添加股票后，会在这里低调刷新</span><button onClick={() => setAddOpen(true)}>添加第一只</button></div>}
    </section>
    <footer className="app-footer"><span className={networkError ? 'warn' : ''}><i/>{networkError ? '数据延迟' : state.settings.paused ? '刷新已暂停' : `${isTradingTime() ? state.settings.refreshMs / 1000 : 60} 秒刷新`}</span><span>主力 = 大单 + 超大单净额</span></footer>
    {settingsOpen && <SettingsPanel value={state.settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} shortcutError={shortcutError}/>} 
    {addOpen && <AddStock state={state} onSave={save} onClose={() => setAddOpen(false)}/>} 
    {alertFor && <AlertEditor stock={state.watchlist.find(v => secid(v) === alertFor)!} alerts={state.alerts.filter(a => a.secid === alertFor)} onSave={alerts => save({ alerts: [...state.alerts.filter(a => a.secid !== alertFor), ...alerts] })} onClose={() => setAlertFor(undefined)}/>} 
  </div>
}

function AddStock({ state, onSave, onClose }: { state: AppState; onSave(p: Partial<AppState>): void; onClose(): void }) {
  const [query, setQuery] = useState(''); const [results, setResults] = useState<SearchResult[]>([]); const [loading, setLoading] = useState(false); const timer = useRef<number | undefined>(undefined)
  const search = (value: string) => { setQuery(value); clearTimeout(timer.current); if (!value.trim()) return setResults([]); timer.current = window.setTimeout(async () => { setLoading(true); try { setResults(await window.marketFloat.searchStocks(value)) } finally { setLoading(false) } }, 300) }
  const add = (item: SearchResult) => { const exists = state.watchlist.some(v => secid(v) === secid(item)); const list = exists ? state.watchlist.map(v => secid(v) === secid(item) ? { ...v, hidden: false, name: item.name } : v) : [...state.watchlist, item]; onSave({ watchlist: list }); onClose() }
  return <div className="overlay"><section className="panel add-panel"><div className="panel-head"><h2>添加自选</h2><button onClick={onClose}><X size={18}/></button></div><div className="searchbox"><Search size={16}/><input autoFocus value={query} onChange={e => search(e.target.value)} placeholder="输入名称、600519、HK00700"/></div><div className="results">{loading && <p>搜索中…</p>}{results.map(v => <button key={secid(v)} onClick={() => add(v)}><span className="market-badge">{displayMarket(v.market)}</span><b>{v.name}</b><small>{v.code}</small><Plus size={16}/></button>)}{query && !loading && !results.length && <p>未找到匹配标的</p>}</div><p className="fineprint">支持沪深 6 位代码，以及 HK + 港股代码。</p></section></div>
}

function AlertEditor({ stock, alerts, onSave, onClose }: { stock: WatchItem; alerts: PriceAlert[]; onSave(v: PriceAlert[]): void; onClose(): void }) {
  const [metric, setMetric] = useState<PriceAlert['metric']>('priceAbove'); const [threshold, setThreshold] = useState(''); const [rules, setRules] = useState(alerts)
  const persist = (next: PriceAlert[]) => { setRules(next); onSave(next) }
  const add = () => { const n = Number(threshold); if (!Number.isFinite(n) || !threshold) return; persist([...rules, { id: crypto.randomUUID(), secid: secid(stock), metric, threshold: n, enabled: true }]); setThreshold('') }
  return <div className="overlay"><section className="panel alert-panel"><div className="panel-head"><div><small>{stock.code}</small><h2>{stock.name} · 提醒</h2></div><button onClick={onClose}><X size={18}/></button></div><div className="alert-form"><select value={metric} onChange={e => setMetric(e.target.value as PriceAlert['metric'])}><option value="priceAbove">价格高于</option><option value="priceBelow">价格低于</option><option value="changeAbove">涨跌幅高于</option><option value="changeBelow">涨跌幅低于</option></select><input type="number" step="0.01" value={threshold} onChange={e => setThreshold(e.target.value)} placeholder="阈值"/><button onClick={add}>添加提醒</button></div>{rules.length > 0 && <div className="existing-alerts">{rules.map(a => <div key={a.id}><input type="checkbox" checked={a.enabled} onChange={e => persist(rules.map(v => v.id === a.id ? { ...v, enabled: e.target.checked } : v))}/><span>{a.metric.includes('price') ? '价格' : '涨跌幅'} {a.metric.includes('Above') ? '≥' : '≤'} {a.threshold}{a.metric.includes('change') ? '%' : ''}</span><button onClick={() => persist(rules.filter(v => v.id !== a.id))}><Trash2 size={13}/></button></div>)}</div>}<p className="fineprint">条件从未满足变为满足时提醒，5 分钟内不会重复通知。</p></section></div>
}
