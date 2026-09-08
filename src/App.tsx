import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ArrowLeft, Bell, ChevronDown, ChevronUp, Eye, EyeOff, Flame, LayoutGrid, Moon, Pause, Play, Plus, Rows3, Search, Sun, Trash2, X } from 'lucide-react'
import type { AppState, DetailData, HotRankItem, PriceAlert, Quote, SearchResult, SectorRankItem, SectorStockItem, SplitEstimate, TodoItem, TodoLog, WatchItem } from './types'
import { alertTriggered, calculatePositionProfit, directionClass, displayMarket, fmtMoney, fmtPrice, isTradingTime, secid, smartSignal } from './utils'
import Sparkline from './components/Sparkline'
import TitleBar from './components/TitleBar'
import Decoy from './components/Decoy'
import SettingsPanel from './components/SettingsPanel'
import Candlestick from './components/Candlestick'
import IntradayChart from './components/IntradayChart'

const fallbackState: AppState = { watchlist: [], alerts: [], todos: '', todoItems: [], todoLogs: [], settings: { refreshMs: 1000, idleRefreshMs: 15000, opacity: .96, theme: 'dark', colorMode: 'cn', tickerShortcut: 'F8', notesShortcut: 'F7', hideShortcut: 'F9', notifications: true, smartAlerts: true, launchAtLogin: false, locked: false, paused: false, commissionRate: 2.5, minimumCommission: 5, stampDutyRate: 0.05, compactMode: false, positionsFirst: true, watchSortMode: 'manual', largeOrderThreshold: 200000 } }
const mergeDetail = (loaded: DetailData, previous?: DetailData): DetailData => ({ ...loaded, intraday: loaded.intraday.length ? loaded.intraday : previous?.intraday ?? [], price: loaded.price.length ? loaded.price : previous?.price ?? [], averagePrice: loaded.averagePrice.length ? loaded.averagePrice : previous?.averagePrice ?? [], minuteCapital: loaded.minuteCapital.length ? loaded.minuteCapital : previous?.minuteCapital ?? [], flow5m: loaded.flow5m ?? previous?.flow5m ?? null, flow10m: loaded.flow10m ?? previous?.flow10m ?? null, flow5mTradeCount: loaded.flow5m == null ? previous?.flow5mTradeCount ?? 0 : loaded.flow5mTradeCount, flow10mTradeCount: loaded.flow10m == null ? previous?.flow10mTradeCount ?? 0 : loaded.flow10mTradeCount, flowCoverageMinutes: loaded.flow10m == null ? previous?.flowCoverageMinutes ?? 0 : loaded.flowCoverageMinutes, klines: loaded.klines.length ? loaded.klines : previous?.klines ?? [], capital: loaded.capital.length ? loaded.capital : previous?.capital ?? [], splitSignals: loaded.splitEstimate.sampleCount ? loaded.splitSignals : previous?.splitSignals ?? [], splitEstimate: loaded.splitEstimate.sampleCount ? loaded.splitEstimate : previous?.splitEstimate ?? loaded.splitEstimate })
const exactMoney = (value: number) => `${value > 0 ? '+' : value < 0 ? '-' : ''}${new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(value))}`

export default function App() {
  const [state, setState] = useState<AppState>(fallbackState)
  const [quotes, setQuotes] = useState<Record<string, Quote>>({})
  const [details, setDetails] = useState<Record<string, DetailData>>({})
  const [expanded, setExpanded] = useState<string>()
  const [focused, setFocused] = useState<string>()
  const [decoy, setDecoy] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [alertFor, setAlertFor] = useState<string>()
  const [hotOpen, setHotOpen] = useState(false)
  const [hotRanks, setHotRanks] = useState<HotRankItem[]>([])
  const [sectorOpen, setSectorOpen] = useState(false)
  const [sectorRanks, setSectorRanks] = useState<SectorRankItem[]>([])
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
      setQuotes(old => ({ ...old, ...Object.fromEntries(incoming.map(v => { const id = secid(v); const previous = old[id]; return [id, v.status === 'delayed' && previous ? { ...previous, ...v, mainNetInflow: v.mainNetInflow ?? previous.mainNetInflow, mainNetRatio: v.mainNetRatio ?? previous.mainNetRatio, superLargeNet: v.superLargeNet ?? previous.superLargeNet, largeNet: v.largeNet ?? previous.largeNet, amount: v.amount ?? previous.amount, volumeRatio: v.volumeRatio ?? previous.volumeRatio, actualTurnoverRate: v.actualTurnoverRate ?? previous.actualTurnoverRate } : v] })) })); setLastUpdated(new Date()); setNetworkError(incoming.every(v => v.status === 'offline')); checkAlerts(incoming)
    } catch { setNetworkError(true); setQuotes(old => Object.fromEntries(Object.entries(old).map(([k, v]) => [k, { ...v, status: 'delayed' }]))) }
    finally { busy.current = false }
  }, [state.watchlist, state.settings.paused, checkAlerts])

  useEffect(() => {
    if (!decoy) refresh()
    const chooseDelay = () => decoy || document.hidden ? state.settings.idleRefreshMs : isTradingTime() ? state.settings.refreshMs : 60_000
    let timer = window.setTimeout(function tick() { refresh(); timer = window.setTimeout(tick, chooseDelay()) }, chooseDelay())
    return () => clearTimeout(timer)
  }, [refresh, decoy, state.settings.refreshMs, state.settings.idleRefreshMs])

  useEffect(() => {
    if (!expanded || decoy || state.settings.paused) return
    const item = state.watchlist.find(v => secid(v) === expanded); if (!item) return
    let cancelled = false
    const load = async (scope: 'full' | 'live' | 'history') => { if (detailBusy.current) return; detailBusy.current = true; try { const loaded = await window.marketFloat.fetchDetail(item, scope, state.settings.largeOrderThreshold); if (!cancelled) { setDetails(old => ({ ...old, [expanded]: mergeDetail(loaded, old[expanded]) })); if (loaded.splitEstimate.sampleCount) setSplits(old => ({ ...old, [expanded]: loaded.splitEstimate })) } } finally { detailBusy.current = false } }
    load('full')
    const liveTimer = window.setInterval(() => load('live'), 3000)
    const historyTimer = window.setInterval(() => load('history'), 300_000)
    return () => { cancelled = true; clearInterval(liveTimer); clearInterval(historyTimer) }
  }, [expanded, decoy, state.settings.paused, state.settings.largeOrderThreshold, state.watchlist])

  useEffect(() => {
    if (decoy || state.settings.paused) return
    const loadNext = async () => { const visible = state.watchlist.filter(v => !v.hidden).slice(0, 12); if (!visible.length || splitBusy.current) return; const item = visible[splitCursor.current++ % visible.length]; const id = secid(item); splitBusy.current = true; try { const estimate = await window.marketFloat.fetchSplitEstimate(item, state.settings.largeOrderThreshold); setSplits(old => ({ ...old, [id]: estimate })); const signal = smartSignal(quotesRef.current[id], estimate); const now = Date.now(); if (signal && state.settings.notifications && state.settings.smartAlerts && now - (smartAlertTimes.current[id] ?? 0) > 900_000) { const q = quotesRef.current[id]; window.marketFloat.notify(`${q?.name || item.name} · 资金${signal === 'inflow' ? '流入' : '流出'}共振`, `量比 ${q?.volumeRatio?.toFixed(2)}，明盘与拆单估算同向${signal === 'inflow' ? '流入' : '流出'}`); smartAlertTimes.current[id] = now } } catch { /* retain the last valid estimate */ } finally { splitBusy.current = false } }
    loadNext(); const timer = window.setInterval(loadNext, 3000); return () => clearInterval(timer)
  }, [decoy, state.settings.paused, state.settings.notifications, state.settings.smartAlerts, state.settings.largeOrderThreshold, state.watchlist])

  useEffect(() => { if (hotOpen) window.marketFloat.fetchHotRank().then(setHotRanks).catch(() => setHotRanks([])) }, [hotOpen])
  useEffect(() => { if (sectorOpen) window.marketFloat.fetchSectorRank().then(setSectorRanks).catch(() => setSectorRanks([])) }, [sectorOpen])

  const toggleDetail = (item: WatchItem) => {
    const id = secid(item); setFocused(id); if (expanded === id) return setExpanded(undefined)
    setExpanded(id)
  }
  const updateSettings = async (settings: AppState['settings']) => {
    setState(s => ({ ...s, settings })); await save({ settings }); window.marketFloat.setWindowOpacity(settings.opacity); window.marketFloat.setWindowLocked(settings.locked); window.marketFloat.setLaunchAtLogin(settings.launchAtLogin)
    const result = await window.marketFloat.updateShortcut(settings.tickerShortcut, settings.notesShortcut, settings.hideShortcut); setShortcutError(result.error)
  }
  const visibleItems = useMemo(() => {
    const list = state.watchlist.filter(item => !item.hidden)
    const position = (item: WatchItem) => item.costPrice != null && (item.holdingLots ?? 0) > 0
    const sortValue = (item: WatchItem) => {
      const id = secid(item); const quote = quotes[id]; const detail = details[id]
      if (state.settings.watchSortMode === 'change') return quote?.changePercent ?? -Infinity
      if (state.settings.watchSortMode === 'mainFlow') return quote?.mainNetInflow ?? -Infinity
      if (state.settings.watchSortMode === 'flow5m') return detail?.flow5m ?? -Infinity
      if (state.settings.watchSortMode === 'flow10m') return detail?.flow10m ?? -Infinity
      if (state.settings.watchSortMode === 'volumeRatio') return quote?.volumeRatio ?? -Infinity
      if (state.settings.watchSortMode === 'profit') return calculatePositionProfit(quote?.price ?? null, item.costPrice, item.holdingLots, item.lotSize ?? 100, state.settings)?.amount ?? -Infinity
      return 0
    }
    return [...list].sort((a, b) => {
      if (state.settings.positionsFirst && position(a) !== position(b)) return position(a) ? -1 : 1
      return state.settings.watchSortMode === 'manual' ? list.indexOf(a) - list.indexOf(b) : sortValue(b) - sortValue(a)
    })
  }, [state.watchlist, state.settings, quotes, details])

  useEffect(() => {
    if (decoy || settingsOpen || addOpen || hotOpen || sectorOpen || alertFor) return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input,textarea,select,[contenteditable="true"]')) return
      if (event.key === 'Escape') { setExpanded(undefined); setFocused(undefined); return }
      if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key) || !visibleItems.length) return
      event.preventDefault()
      if (event.key === 'Enter') { const id = focused ?? secid(visibleItems[0]); setFocused(id); setExpanded(current => current === id ? undefined : id); return }
      const current = visibleItems.findIndex(item => secid(item) === (focused ?? expanded)); const offset = event.key === 'ArrowDown' ? 1 : -1
      const index = current < 0 ? 0 : (current + offset + visibleItems.length) % visibleItems.length; const id = secid(visibleItems[index])
      setFocused(id); setExpanded(id); window.setTimeout(() => document.querySelector(`[data-stock-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 0)
    }
    window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown)
  }, [decoy, settingsOpen, addOpen, hotOpen, sectorOpen, alertFor, visibleItems, focused, expanded])

  const backupData = Object.values(quotes).some(v => v.status === 'delayed')
  const status = state.settings.paused ? '已暂停' : networkError ? '连接异常' : lastUpdated ? `${lastUpdated.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })} ${backupData ? '备用行情' : '更新'}` : '正在连接'
  const signalSummary = useMemo(() => state.watchlist.filter(v => !v.hidden).reduce((sum, item) => { const signal = smartSignal(quotes[secid(item)], splits[secid(item)]); if (signal) sum[signal]++; return sum }, { inflow: 0, outflow: 0 }), [state.watchlist, quotes, splits])

  if (decoy) return <Decoy items={state.todoItems} logs={state.todoLogs} tickerShortcut={state.settings.tickerShortcut} onItemsChange={(todoItems: TodoItem[]) => save({ todoItems })} onLogsChange={(todoLogs: TodoLog[]) => save({ todoLogs })} onSaveLog={(log: TodoLog) => save({ todoLogs: [log, ...state.todoLogs].slice(0, 180) })}/>
  return <div className={`app-shell ${state.settings.compactMode ? 'compact' : ''}`} data-theme={state.settings.theme}>
    <TitleBar locked={state.settings.locked} status={status} onLock={() => updateSettings({ ...state.settings, locked: !state.settings.locked })} onSettings={() => setSettingsOpen(true)} onHide={() => window.marketFloat.hideWindow()}/>
    <div className="toolbar">
      <div><span className="eyebrow">WATCHLIST</span><h1>自选行情</h1></div>
      <div className="tool-actions"><button className={state.settings.compactMode ? 'active' : ''} title="切换紧凑列表" onClick={() => updateSettings({ ...state.settings, compactMode: !state.settings.compactMode })}><Rows3 size={16}/></button><button title={state.settings.theme === 'dark' ? '切换亮色' : '切换暗色'} onClick={() => updateSettings({ ...state.settings, theme: state.settings.theme === 'dark' ? 'light' : 'dark' })}>{state.settings.theme === 'dark' ? <Sun size={16}/> : <Moon size={16}/>}</button><button title="热门板块 TOP 10" onClick={() => setSectorOpen(true)}><LayoutGrid size={16}/></button><button title="热度榜 TOP 10" onClick={() => setHotOpen(true)}><Flame size={16}/></button><button className={state.settings.paused ? 'active' : ''} title={state.settings.paused ? '继续刷新' : '暂停刷新'} onClick={() => updateSettings({ ...state.settings, paused: !state.settings.paused })}>{state.settings.paused ? <Play size={16}/> : <Pause size={16}/>}</button><button className="add" onClick={() => setAddOpen(true)}><Plus size={17}/><span>添加</span></button></div>
    </div>
    {!!visibleItems.length && <div className="scan-summary"><span><Activity size={12}/>智能扫描</span><b className="rise">流入 {signalSummary.inflow}</b><b className="fall">流出 {signalSummary.outflow}</b><select title="自选排序" value={state.settings.watchSortMode} onChange={e => updateSettings({ ...state.settings, watchSortMode: e.target.value as AppState['settings']['watchSortMode'] })}><option value="manual">自选顺序</option><option value="change">涨幅</option><option value="mainFlow">主力净流入</option><option value="flow5m">5分钟资金</option><option value="flow10m">10分钟资金</option><option value="volumeRatio">量比</option><option value="profit">持仓盈亏</option></select></div>}
    <div className="column-head"><span>标的 / 资金动向</span><span>最新 / 涨跌</span></div>
    <section className="watchlist">
      {visibleItems.map(item => {
        const id = secid(item); const q = quotes[id]; const split = splits[id]; const change = q?.changePercent ?? null; const open = expanded === id; const detail = details[id]; const signal = smartSignal(q, split)
        const profit = calculatePositionProfit(q?.price ?? null, item.costPrice, item.holdingLots, item.lotSize ?? 100, state.settings)
        const flowAccelerating = detail?.flow5m != null && detail.flow10m != null && Math.sign(detail.flow5m) === Math.sign(detail.flow10m) && Math.abs(detail.flow5m) >= 1_000_000 && Math.abs(detail.flow5m) >= Math.abs(detail.flow10m) * .65
        const average = detail?.averagePrice.at(-1)?.value; const averageBreak = q?.price != null && average != null && (q.volumeRatio ?? 0) >= 1.5
        const nearCost = q?.price != null && item.costPrice != null && Math.abs(q.price - item.costPrice) / item.costPrice <= .005
        return <article data-stock-id={id} className={`stock-card ${open ? 'expanded' : ''} ${focused === id ? 'keyboard-focus' : ''}`} key={id}>
          <button className="stock-main" onClick={() => toggleDetail(item)}>
            <div className="identity"><div><span className="market-badge">{displayMarket(item.market)}</span><b>{q?.name || item.name}</b>{profit && <span className={`quick-profit ${directionClass(profit.amount, state.settings)}`}>{exactMoney(profit.amount)}元 · {profit.percent > 0 ? '+' : ''}{profit.percent.toFixed(2)}%</span>}</div><small>{item.code}</small><div className={`capital ${directionClass(q?.mainNetInflow ?? null, state.settings)}`}><span>明盘</span>{fmtMoney(q?.mainNetInflow ?? null)}<em className={directionClass(split?.netAmount ?? null, state.settings)}>暗盘 {split ? fmtMoney(split.netAmount) : '扫描中'}</em></div><div className="signal-chips">{signal && <i className={`signal-chip resonance ${directionClass(signal === 'inflow' ? 1 : -1, state.settings)}`}>{signal === 'inflow' ? '流入共振' : '流出共振'}</i>}{flowAccelerating && <i className={`signal-chip ${directionClass(detail!.flow5m, state.settings)}`}>5分钟资金加速</i>}{averageBreak && <i className={`signal-chip ${directionClass(q!.price! - average!, state.settings)}`}>{q!.price! >= average! ? '放量站上均价' : '放量跌破均价'}</i>}{nearCost && <i className="signal-chip hot">临近成本线</i>}{(q?.volumeRatio ?? 0) >= 2 && <i className="signal-chip hot">量比放大</i>}{split && Math.abs(split.netAmount) >= 2_000_000 && <i className="signal-chip">疑似拆单</i>}</div><div className="compact-metrics"><span>5m <b className={directionClass(detail?.flow5m ?? null, state.settings)}>{fmtMoney(detail?.flow5m ?? null)}</b></span><span>主力 <b className={directionClass(q?.mainNetInflow ?? null, state.settings)}>{fmtMoney(q?.mainNetInflow ?? null)}</b></span></div></div>
            <div className="quote"><b>{fmtPrice(q?.price ?? null)}</b><span className={directionClass(change, state.settings)}>{change == null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(2)}%`}</span></div>
            {open ? <ChevronUp className="chevron" size={14}/> : <ChevronDown className="chevron" size={14}/>} 
          </button>
          {open && <div className="detail">
            <div className="chart-block intraday-block"><header><span>当日完整分时成交</span><span>{detail?.intraday.at(-1)?.time?.slice(-5) ?? '加载中'}</span></header><IntradayChart points={detail?.intraday ?? []} previousClose={q?.previousClose ?? null} market={item.market}/></div>
            <div className="metric-grid"><div><span>成交额</span><b>{fmtMoney(q?.amount ?? null).replace('+','')}</b></div><div><span>量比</span><b>{q?.volumeRatio == null ? '—' : q.volumeRatio.toFixed(2)}</b></div><div><span>实际换手率</span><b>{q?.actualTurnoverRate == null ? '—' : `${q.actualTurnoverRate.toFixed(2)}%`}</b></div></div>
            <div className="flow-window-grid"><div><span>当日成交均价</span><b className="average-value">{fmtPrice(detail?.averagePrice.at(-1)?.value ?? null)}</b><small>累计成交计算</small></div><div><span>近 5 分钟主力</span><b className={directionClass(detail?.flow5m ?? null, state.settings)}>{fmtMoney(detail?.flow5m ?? null)}</b><small>{detail ? `${detail.flow5mTradeCount} 笔主动大单` : '计算中'}</small></div><div><span>近 10 分钟主力</span><b className={directionClass(detail?.flow10m ?? null, state.settings)}>{fmtMoney(detail?.flow10m ?? null)}</b><small>{detail ? `${detail.flow10mTradeCount} 笔主动大单` : '计算中'}</small></div></div>
            <p className="flow-method-note">软件按最近逐笔成交自行计算：单笔成交额 ≥ {fmtMoney(state.settings.largeOrderThreshold).replace('+','')}，主动买入为正、主动卖出为负；当前样本覆盖约 {detail?.flowCoverageMinutes.toFixed(1) ?? '—'} 分钟。</p>
            <div className="chart-block"><header><span>30 日 K 线</span><span>{detail?.klines.at(-1)?.date ?? '加载中'}</span></header><Candlestick points={detail?.klines ?? []} costPrice={item.costPrice}/></div>
            <PositionCard item={item} price={q?.price ?? null} settings={state.settings} onSave={position => save({ watchlist: state.watchlist.map(v => secid(v) === id ? { ...v, ...position } : v) })}/>
            <div className="chart-block"><header><span>近 20 日主力资金</span><span>{item.market === 'HK' ? '趋势暂无数据' : fmtMoney(q?.mainNetInflow ?? null)}</span></header><Sparkline points={detail?.capital ?? []} positive={(q?.mainNetInflow ?? 0) >= 0}/></div>
            <div className="breakdown"><span>超大单 <b className={directionClass(q?.superLargeNet ?? null, state.settings)}>{fmtMoney(q?.superLargeNet ?? null)}</b></span><span>大单 <b className={directionClass(q?.largeNet ?? null, state.settings)}>{fmtMoney(q?.largeNet ?? null)}</b></span></div>
            <div className="split-radar"><header><span>暗盘 · 疑似拆单</span><small>算法推测 · 逐笔扫描</small></header><div className="split-coverage"><span>样本 {detail?.splitEstimate.sampleCount ?? 0} 笔</span><span>覆盖 {detail?.splitEstimate.coverageMinutes.toFixed(1) ?? '—'} 分钟</span><span>最高可信度 {detail?.splitEstimate.confidence ?? 0}%</span></div><div className="split-summary"><span>拆单买入 <b className={directionClass(1,state.settings)}>{fmtMoney(detail?.splitEstimate.buyAmount ?? 0)}</b></span><span>拆单卖出 <b className={directionClass(-1,state.settings)}>{fmtMoney(-(detail?.splitEstimate.sellAmount ?? 0))}</b></span></div>{detail?.splitSignals?.length ? detail.splitSignals.map(signal => <div className={`split-signal ${signal.side === 'buy' ? directionClass(1, state.settings) : directionClass(-1, state.settings)}`} key={signal.side}><b>{signal.side === 'buy' ? '疑似拆单买入' : '疑似拆单卖出'}</b><span>{fmtMoney(signal.totalAmount)} · {signal.tradeCount} 笔</span><em>置信度 {signal.confidence}%</em></div>) : <p>当前样本未发现明显拆单；样本不足时不作推断</p>}</div>
            <div className="detail-actions"><button onClick={() => setAlertFor(id)}><Bell size={14}/>提醒</button><button onClick={() => save({ watchlist: state.watchlist.map(v => secid(v) === id ? { ...v, hidden: true } : v) })}><EyeOff size={14}/>隐藏</button><button className="danger" onClick={() => save({ watchlist: state.watchlist.filter(v => secid(v) !== id) })}><Trash2 size={14}/>删除</button></div>
          </div>}
        </article>
      })}
      {!visibleItems.length && <div className="empty"><Eye size={26}/><b>还没有自选标的</b><span>添加股票后，会在这里低调刷新</span><button onClick={() => setAddOpen(true)}>添加第一只</button></div>}
    </section>
    <footer className="app-footer"><span className={networkError || backupData ? 'warn' : ''}><i/>{networkError ? '连接异常' : backupData ? '备用行情 · 资金保留上次值' : state.settings.paused ? '刷新已暂停' : `${isTradingTime() ? state.settings.refreshMs / 1000 : 60} 秒刷新`}</span><span>主力 = 大单 + 超大单净额</span></footer>
    {settingsOpen && <SettingsPanel value={state.settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} shortcutError={shortcutError}/>} 
    {addOpen && <AddStock state={state} onSave={save} onClose={() => setAddOpen(false)}/>} 
    {hotOpen && <HotRankPanel items={hotRanks} state={state} onSave={save} onClose={() => setHotOpen(false)}/>} 
    {sectorOpen && <SectorRankPanel items={sectorRanks} state={state} onSave={save} onClose={() => setSectorOpen(false)}/>}
    {alertFor && <AlertEditor stock={state.watchlist.find(v => secid(v) === alertFor)!} alerts={state.alerts.filter(a => a.secid === alertFor)} onSave={alerts => save({ alerts: [...state.alerts.filter(a => a.secid !== alertFor), ...alerts] })} onClose={() => setAlertFor(undefined)}/>} 
  </div>
}

function PositionCard({ item, price, settings, onSave }: { item: WatchItem; price: number | null; settings: AppState['settings']; onSave(value: Pick<WatchItem, 'costPrice' | 'holdingLots' | 'lotSize'>): void }) {
  const defaultLotSize = item.market === 'HK' ? 100 : 100
  const [cost, setCost] = useState(item.costPrice?.toString() ?? '')
  const [lots, setLots] = useState(item.holdingLots?.toString() ?? '')
  const [lotSize, setLotSize] = useState((item.lotSize ?? defaultLotSize).toString())
  useEffect(() => { setCost(item.costPrice?.toString() ?? ''); setLots(item.holdingLots?.toString() ?? ''); setLotSize((item.lotSize ?? defaultLotSize).toString()) }, [item.costPrice, item.holdingLots, item.lotSize, defaultLotSize])
  const profit = calculatePositionProfit(price, item.costPrice, item.holdingLots, item.lotSize ?? defaultLotSize, settings)
  const persist = () => {
    const costPrice = Number(cost); const holdingLots = Number(lots); const size = Number(lotSize)
    if (!Number.isFinite(costPrice) || costPrice <= 0 || !Number.isFinite(holdingLots) || holdingLots < 0 || !Number.isFinite(size) || size <= 0) return
    onSave({ costPrice, holdingLots, lotSize: item.market === 'HK' ? size : 100 })
  }
  const clear = () => { setCost(''); setLots(''); setLotSize(defaultLotSize.toString()); onSave({ costPrice: undefined, holdingLots: undefined, lotSize: undefined }) }
  return <section className="position-card">
    <header><span>我的持仓 · 仅保存在本机</span>{item.costPrice != null && <button onClick={clear}>清除</button>}</header>
    <div className="position-form">
      <label>成本价<input type="number" min="0" step="0.001" value={cost} onChange={e => setCost(e.target.value)} placeholder="例如 32.50"/></label>
      <label>持仓手数<input type="number" min="0" step="1" value={lots} onChange={e => setLots(e.target.value)} placeholder="例如 10"/></label>
      {item.market === 'HK' && <label>每手股数<input type="number" min="1" step="1" value={lotSize} onChange={e => setLotSize(e.target.value)} placeholder="100"/></label>}
      <button onClick={persist}>保存持仓</button>
    </div>
    {profit && <><div className="position-profit">
      <div><span>净浮动盈亏</span><b className={directionClass(profit.amount, settings)}>{exactMoney(profit.amount)} 元</b></div>
      <div><span>距成本线</span><b className={directionClass(profit.pointChange, settings)}>{profit.pointChange > 0 ? '+' : ''}{fmtPrice(profit.pointChange)} 点</b></div>
      <div><span>收益率</span><b className={directionClass(profit.percent, settings)}>{profit.percent > 0 ? '+' : ''}{profit.percent.toFixed(2)}%</b></div>
    </div><p className="position-note">{item.holdingLots} 手 · {profit.shares.toLocaleString('zh-CN')} 股 · 预估费用 {exactMoney(profit.fees).replace('+', '')} 元（按一次买入、当前一次卖出）</p></>}
  </section>
}

function SectorRankPanel({ items, state, onSave, onClose }: { items: SectorRankItem[]; state: AppState; onSave(patch: Partial<AppState>): void; onClose(): void }) {
  const [selected, setSelected] = useState<SectorRankItem>()
  const [stocks, setStocks] = useState<SectorStockItem[]>([])
  const [loading, setLoading] = useState(false)
  const openSector = async (sector: SectorRankItem) => { setSelected(sector); setStocks([]); setLoading(true); try { setStocks(await window.marketFloat.fetchSectorStocks(sector)) } catch { setStocks([]) } finally { setLoading(false) } }
  const add = (stock: SectorStockItem) => { const id = secid(stock); const exists = state.watchlist.some(item => secid(item) === id); onSave({ watchlist: exists ? state.watchlist.map(item => secid(item) === id ? { ...item, hidden: false, name: stock.name } : item) : [...state.watchlist, { market: stock.market, code: stock.code, name: stock.name }] }) }
  const back = () => { setSelected(undefined); setStocks([]) }
  return <div className="overlay"><section className="panel hot-panel sector-panel">
    <div className="panel-head"><div>{selected && <button className="back-button" onClick={back}><ArrowLeft size={14}/>返回板块榜</button>}<small>{selected ? `${selected.kind === 'industry' ? '行业' : '概念'} · 涨幅排序` : '按主力净流入排序'}</small><h2>{selected ? `${selected.name} · 涨幅前 20` : '热门板块 TOP 10'}</h2></div><button onClick={onClose}><X size={18}/></button></div>
    {selected ? <div className="sector-stock-list">{loading ? <p>正在获取板块成分股…</p> : stocks.length ? stocks.map((stock, index) => { const added = state.watchlist.some(item => secid(item) === secid(stock) && !item.hidden); return <div key={secid(stock)}><strong>{index + 1}</strong><span><b>{stock.name}</b><small>{stock.code}{stock.popularityRank ? ` · 人气 ${stock.popularityRank}` : ''}</small><em>{stock.leaderLabels.map(label => <i key={label}>{label}</i>)}</em></span><span className="sector-quote"><b>{fmtPrice(stock.price)}</b><small className={directionClass(stock.changePercent, state.settings)}>{stock.changePercent == null ? '—' : `${stock.changePercent > 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%`}</small></span><button disabled={added} onClick={() => add(stock)}>{added ? '已自选' : '+ 自选'}</button></div>}) : <p>板块成分股暂时不可用</p>}</div> : <div className="sector-list">{items.length ? items.map((item, index) => <button className="sector-row" onClick={() => openSector(item)} key={`${item.kind}-${item.code}`}><strong>{index + 1}</strong><span><b>{item.name}</b><small>{item.kind === 'industry' ? '行业' : '概念'} · {item.code}</small></span><em className={directionClass(item.changePercent, state.settings)}>{item.changePercent == null ? '—' : `${item.changePercent > 0 ? '+' : ''}${item.changePercent.toFixed(2)}%`}</em><i className={directionClass(item.mainNetInflow, state.settings)}>{fmtMoney(item.mainNetInflow)}<small>{item.mainNetRatio == null ? '' : `${item.mainNetRatio.toFixed(2)}%`}</small></i></button>) : <p>板块数据加载中或暂时不可用</p>}</div>}
    <p className="fineprint">{selected ? '涨幅与资金龙头按当前板块榜数据计算；人气龙头来自公开实时人气榜。龙头标签仅描述当前数据，不代表投资建议。' : '点击板块可查看涨幅前 20 成分股及龙头标记。'}</p>
  </section></div>
}

function AddStock({ state, onSave, onClose }: { state: AppState; onSave(p: Partial<AppState>): void; onClose(): void }) {
  const [query, setQuery] = useState(''); const [results, setResults] = useState<SearchResult[]>([]); const [loading, setLoading] = useState(false); const timer = useRef<number | undefined>(undefined)
  const search = (value: string) => { setQuery(value); clearTimeout(timer.current); if (!value.trim()) return setResults([]); timer.current = window.setTimeout(async () => { setLoading(true); try { setResults(await window.marketFloat.searchStocks(value)) } finally { setLoading(false) } }, 300) }
  const add = (item: SearchResult) => { const exists = state.watchlist.some(v => secid(v) === secid(item)); const list = exists ? state.watchlist.map(v => secid(v) === secid(item) ? { ...v, hidden: false, name: item.name } : v) : [...state.watchlist, item]; onSave({ watchlist: list }); onClose() }
  const hidden = state.watchlist.filter(item => item.hidden)
  const restore = (item: WatchItem) => onSave({ watchlist: state.watchlist.map(value => secid(value) === secid(item) ? { ...value, hidden: false } : value) })
  return <div className="overlay"><section className="panel add-panel"><div className="panel-head"><h2>添加自选</h2><button onClick={onClose}><X size={18}/></button></div><div className="searchbox"><Search size={16}/><input autoFocus value={query} onChange={e => search(e.target.value)} placeholder="输入名称、600519、HK00700"/></div>{!query && hidden.length > 0 && <div className="hidden-stocks"><header>已隐藏自选</header>{hidden.map(item => <button key={secid(item)} onClick={() => restore(item)}><Eye size={13}/><span>{item.name}</span><small>{item.code}</small><b>恢复</b></button>)}</div>}<div className="results">{loading && <p>搜索中…</p>}{results.map(v => <button key={secid(v)} onClick={() => add(v)}><span className="market-badge">{displayMarket(v.market)}</span><b>{v.name}</b><small>{v.code}</small><Plus size={16}/></button>)}{query && !loading && !results.length && <p>未找到匹配标的</p>}</div><p className="fineprint">支持沪深 6 位代码及港股代码；隐藏的股票可在这里直接恢复。</p></section></div>
}

function HotRankPanel({ items, state, onSave, onClose }: { items: HotRankItem[]; state: AppState; onSave(p: Partial<AppState>): void; onClose(): void }) {
  const add = (item: HotRankItem) => { const exists = state.watchlist.some(v => secid(v) === secid(item)); onSave({ watchlist: exists ? state.watchlist.map(v => secid(v) === secid(item) ? { ...v, hidden: false, name: item.name } : v) : [...state.watchlist, { market: item.market, code: item.code, name: item.name }] }) }
  return <div className="overlay"><section className="panel hot-panel"><div className="panel-head"><div><small>A 股实时人气</small><h2>热度排行榜 TOP 10</h2></div><button onClick={onClose}><X size={18}/></button></div><div className="hot-list">{items.length ? items.map(item => { const added = state.watchlist.some(v => secid(v) === secid(item) && !v.hidden); return <div key={secid(item)}><strong>{item.rank}</strong><span><b>{item.name}</b><small>{item.code}</small></span><em className={directionClass(item.changePercent, state.settings)}>{item.changePercent == null ? '—' : `${item.changePercent > 0 ? '+' : ''}${item.changePercent.toFixed(2)}%`}</em><button disabled={added} onClick={() => add(item)}>{added ? '已添加' : '+ 自选'}</button></div>}) : <p>热度数据加载中或暂时不可用</p>}</div><p className="fineprint">热度排名来自公开行情源，仅反映关注度，不代表买卖建议。</p></section></div>
}

function AlertEditor({ stock, alerts, onSave, onClose }: { stock: WatchItem; alerts: PriceAlert[]; onSave(v: PriceAlert[]): void; onClose(): void }) {
  const [metric, setMetric] = useState<PriceAlert['metric']>('priceAbove'); const [threshold, setThreshold] = useState(''); const [rules, setRules] = useState(alerts)
  const persist = (next: PriceAlert[]) => { setRules(next); onSave(next) }
  const add = () => { const n = Number(threshold); if (!Number.isFinite(n) || !threshold) return; persist([...rules, { id: crypto.randomUUID(), secid: secid(stock), metric, threshold: n, enabled: true }]); setThreshold('') }
  return <div className="overlay"><section className="panel alert-panel"><div className="panel-head"><div><small>{stock.code}</small><h2>{stock.name} · 提醒</h2></div><button onClick={onClose}><X size={18}/></button></div><div className="alert-form"><select value={metric} onChange={e => setMetric(e.target.value as PriceAlert['metric'])}><option value="priceAbove">价格高于</option><option value="priceBelow">价格低于</option><option value="changeAbove">涨跌幅高于</option><option value="changeBelow">涨跌幅低于</option></select><input type="number" step="0.01" value={threshold} onChange={e => setThreshold(e.target.value)} placeholder="阈值"/><button onClick={add}>添加提醒</button></div>{rules.length > 0 && <div className="existing-alerts">{rules.map(a => <div key={a.id}><input type="checkbox" checked={a.enabled} onChange={e => persist(rules.map(v => v.id === a.id ? { ...v, enabled: e.target.checked } : v))}/><span>{a.metric.includes('price') ? '价格' : '涨跌幅'} {a.metric.includes('Above') ? '≥' : '≤'} {a.threshold}{a.metric.includes('change') ? '%' : ''}</span><button onClick={() => persist(rules.filter(v => v.id !== a.id))}><Trash2 size={13}/></button></div>)}</div>}<p className="fineprint">条件从未满足变为满足时提醒，5 分钟内不会重复通知。</p></section></div>
}
