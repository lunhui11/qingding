import type { Settings } from '../types'
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
export default function SettingsPanel({ value, onChange, onShortcuts, onClose, shortcutError, notesOnly = false }: { value: Settings; onChange(v: Settings): void; onShortcuts(ticker: string, notes: string, hide: string): Promise<void>; onClose(): void; shortcutError?: string; notesOnly?: boolean }) {
  const set = <K extends keyof Settings>(key: K, next: Settings[K]) => onChange({ ...value, [key]: next })
  const [keys, setKeys] = useState([value.tickerShortcut, value.notesShortcut, value.hideShortcut])
  const [applying, setApplying] = useState(false)
  useEffect(() => setKeys([value.tickerShortcut, value.notesShortcut, value.hideShortcut]), [value.tickerShortcut, value.notesShortcut, value.hideShortcut])
  const apply = async () => { setApplying(true); try { await onShortcuts(keys[0], keys[1], keys[2]) } finally { setApplying(false) } }
  return <div className="overlay"><section className="panel settings-panel">
    <div className="panel-head"><h2>偏好设置</h2><button onClick={onClose}><X size={18}/></button></div>
    <label>窗口透明度 <output>{Math.round(value.opacity * 100)}%</output><input type="range" min="55" max="100" value={value.opacity * 100} onChange={e => set('opacity', Number(e.target.value) / 100)}/></label>
    {!notesOnly && <>
    <label>交易时刷新<input type="number" min="1" max="60" defaultValue={value.refreshMs / 1000} onBlur={e => set('refreshMs', Math.max(1, Number(e.target.value)) * 1000)}/><span>秒</span></label>
    <label>隐藏时刷新<input type="number" min="10" max="300" defaultValue={value.idleRefreshMs / 1000} onBlur={e => set('idleRefreshMs', Math.max(10, Number(e.target.value)) * 1000)}/><span>秒</span></label>
    <label>盯盘主题<select value={value.theme} onChange={e => set('theme', e.target.value as Settings['theme'])}><option value="dark">暗色模式</option><option value="light">亮色模式</option></select></label>
    <label>涨跌颜色<select value={value.colorMode} onChange={e => set('colorMode', e.target.value as Settings['colorMode'])}><option value="cn">红涨绿跌</option><option value="global">绿涨红跌</option></select></label>
    <label className="toggle"><span>持仓股票优先</span><input type="checkbox" checked={value.positionsFirst} onChange={e => set('positionsFirst', e.target.checked)}/></label>
    <label className="toggle"><span>紧凑列表模式</span><input type="checkbox" checked={value.compactMode} onChange={e => set('compactMode', e.target.checked)}/></label>
    <div className="settings-section">逐笔资金计算</div>
    <label>大单最低金额<input type="number" min="1" max="10000" step="5" defaultValue={value.largeOrderThreshold / 10000} onBlur={e => set('largeOrderThreshold', Math.max(1, Math.min(10000, Number(e.target.value) || 20)) * 10000)}/><span>万元</span></label>
    <div className="settings-section">持仓费用估算</div>
    <label>佣金费率<input type="number" min="0" step="0.1" defaultValue={value.commissionRate} onBlur={e => set('commissionRate', Math.max(0, Number(e.target.value)) || 0)}/><span>万分之</span></label>
    <label>单笔最低佣金<input type="number" min="0" step="0.01" defaultValue={value.minimumCommission} onBlur={e => set('minimumCommission', Math.max(0, Number(e.target.value)) || 0)}/><span>元</span></label>
    <label>卖出印花税<input type="number" min="0" step="0.01" defaultValue={value.stampDutyRate} onBlur={e => set('stampDutyRate', Math.max(0, Number(e.target.value)) || 0)}/><span>%</span></label>
    </>}
    {['打开盯盘', '打开便签', '隐藏/恢复'].map((label, index) => <label className="shortcut-field" key={label}>{label}<input value={keys[index]} placeholder="例如 Ctrl+Alt+M" onChange={e => setKeys(current => current.map((key, i) => i === index ? e.target.value : key))}/></label>)}
    <button className="apply-shortcuts" disabled={applying} onClick={apply}>{applying ? '应用中…' : '应用快捷键'}</button>
    <p className="fineprint">当前生效：盯盘 {value.tickerShortcut} · 便签 {value.notesShortcut} · 隐藏 {value.hideShortcut}</p>
    {shortcutError && <p className="error">{shortcutError}</p>}
    <label className="toggle"><span>系统通知</span><input type="checkbox" checked={value.notifications} onChange={e => set('notifications', e.target.checked)}/></label>
    <label className="toggle"><span>开机启动</span><input type="checkbox" checked={value.launchAtLogin} onChange={e => set('launchAtLogin', e.target.checked)}/></label>
    {!notesOnly && <p className="fineprint">5/10 分钟资金由软件按上述门槛分析逐笔主动买卖。费用按一次买入、按当前价一次卖出估算；若成本价已包含费用，可将费率设为 0。样本充足度仅表示成交样本数量和时间跨度，不是身份识别准确率。</p>}
  </section></div>
}
