import type { Settings } from '../types'
import { X } from 'lucide-react'
export default function SettingsPanel({ value, onChange, onClose, shortcutError }: { value: Settings; onChange(v: Settings): void; onClose(): void; shortcutError?: string }) {
  const set = <K extends keyof Settings>(key: K, next: Settings[K]) => onChange({ ...value, [key]: next })
  return <div className="overlay"><section className="panel settings-panel">
    <div className="panel-head"><h2>偏好设置</h2><button onClick={onClose}><X size={18}/></button></div>
    <label>窗口透明度 <output>{Math.round(value.opacity * 100)}%</output><input type="range" min="55" max="100" value={value.opacity * 100} onChange={e => set('opacity', Number(e.target.value) / 100)}/></label>
    <label>交易时刷新<input type="number" min="1" max="60" value={value.refreshMs / 1000} onChange={e => set('refreshMs', Math.max(1, Number(e.target.value)) * 1000)}/><span>秒</span></label>
    <label>隐藏时刷新<input type="number" min="10" max="300" value={value.idleRefreshMs / 1000} onChange={e => set('idleRefreshMs', Math.max(10, Number(e.target.value)) * 1000)}/><span>秒</span></label>
    <label>涨跌颜色<select value={value.colorMode} onChange={e => set('colorMode', e.target.value as Settings['colorMode'])}><option value="cn">红涨绿跌</option><option value="global">绿涨红跌</option></select></label>
    <label>打开盯盘<input value={value.tickerShortcut} onChange={e => set('tickerShortcut', e.target.value)}/></label>
    <label>打开便签<input value={value.notesShortcut} onChange={e => set('notesShortcut', e.target.value)}/></label>
    <label>隐藏/恢复<input value={value.hideShortcut} onChange={e => set('hideShortcut', e.target.value)}/></label>
    {shortcutError && <p className="error">{shortcutError}</p>}
    <label className="toggle"><span>系统通知</span><input type="checkbox" checked={value.notifications} onChange={e => set('notifications', e.target.checked)}/></label>
    <label className="toggle"><span>开机启动</span><input type="checkbox" checked={value.launchAtLogin} onChange={e => set('launchAtLogin', e.target.checked)}/></label>
    <p className="fineprint">公开行情仅供参考，不构成投资建议。3 秒为请求频率，数据源可能以更低频率更新。</p>
  </section></div>
}
