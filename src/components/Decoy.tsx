import { useMemo, useState } from 'react'
import { Archive, ListChecks, Plus, Save, Settings, Trash2 } from 'lucide-react'
import type { TodoItem, TodoLog } from '../types'

export default function Decoy({ items, logs, onSettings, error, onItemsChange, onLogsChange, onSaveLog }: { items: TodoItem[]; logs: TodoLog[]; onSettings(): void; error?: string; onItemsChange(items: TodoItem[]): void; onLogsChange(logs: TodoLog[]): void; onSaveLog(log: TodoLog): Promise<boolean> }) {
  const [view, setView] = useState<'plan' | 'logs'>('plan')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const date = useMemo(() => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date()), [])
  const update = (id: string, patch: Partial<TodoItem>) => onItemsChange(items.map(item => item.id === id ? { ...item, ...patch } : item))
  const add = () => onItemsChange([...items, { id: crypto.randomUUID(), text: '', tag: '今日', completed: false, createdAt: new Date().toISOString() }])
  const saveLog = async () => { if (saving) return; setSaving(true); try { const success = await onSaveLog({ id: crypto.randomUUID(), savedAt: new Date().toISOString(), items: items.map(v => ({ ...v })) }); setSaved(success); if (success) setTimeout(() => setSaved(false), 1600) } finally { setSaving(false) } }
  return <main className="decoy-v2">
    <div className="decoy-top"><div><small>DAILY WORKSPACE</small><h1>{view === 'plan' ? '今日规划' : '工作日志'}</h1><p>{date}</p></div><div className="decoy-tabs"><button title="今日规划" className={view === 'plan' ? 'active' : ''} onClick={() => setView('plan')}><ListChecks size={13}/></button><button title="工作日志" className={view === 'logs' ? 'active' : ''} onClick={() => setView('logs')}><Archive size={13}/></button><button title="偏好设置" onClick={onSettings}><Settings size={13}/></button></div></div>
    {error && <p className="error">{error}</p>}
    {view === 'plan' ? <>
      <section className="todo-list">{items.map(item => <div className={`todo-row ${item.completed ? 'done' : ''}`} key={item.id}><input className="tag-input" value={item.tag} maxLength={8} onChange={e => update(item.id, { tag: e.target.value })}/><input className="todo-text" value={item.text} placeholder="填写今天的工作安排…" onChange={e => update(item.id, { text: e.target.value })}/><input className="todo-check" type="checkbox" checked={item.completed} onChange={e => update(item.id, { completed: e.target.checked, completedAt: e.target.checked ? new Date().toISOString() : undefined })}/><button className="todo-delete" title="删除" onClick={() => onItemsChange(items.filter(v => v.id !== item.id))}>×</button></div>)}<button className="todo-add" onClick={add}><Plus size={13}/> 添加一项计划</button></section>
      <footer className="decoy-actions"><span>{items.filter(v => v.completed).length} / {items.length} 已完成 · 自动保存到本机</span><button disabled={saving} onClick={saveLog}><Save size={12}/> {saving ? '保存中…' : saved ? '已保存' : '保存今日日志'}</button></footer>
    </> : <section className="log-list">{logs.length ? logs.map(log => <article className="log-card" key={log.id}><header><b>{new Date(log.savedAt).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}</b><span>{new Date(log.savedAt).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false, hour: '2-digit', minute: '2-digit' })}</span><button title="删除这条日志" onClick={() => onLogsChange(logs.filter(v => v.id !== log.id))}><Trash2 size={13}/></button></header>{log.items.filter(v => v.text.trim()).map(v => <p className={v.completed ? 'done' : ''} key={v.id}>[{v.tag || '未分类'}] {v.completed ? '✓ ' : '· '}{v.text}</p>)}</article>) : <div className="log-empty">还没有保存过工作日志</div>}</section>}
  </main>
}
