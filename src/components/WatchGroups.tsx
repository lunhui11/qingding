import { useEffect, useState } from 'react'
import type { WatchGroup, WatchItem } from '../types'
import { filterWatchGroup, groupNameError } from '../groups'

export function GroupBar({ groups, items, active, onSelect, onManage }: { groups: WatchGroup[]; items: WatchItem[]; active: string; onSelect(id: string): void; onManage(): void }) {
  const options = [{ id: 'all', name: '全部自选' }, { id: 'ungrouped', name: '未分组' }, ...groups]
  return <div className="watch-groups"><div className="group-tabs" role="tablist" aria-label="自选股分组">{options.map(group => <button key={group.id} role="tab" aria-selected={active === group.id} data-group-filter={group.id} className={active === group.id ? 'active' : ''} onClick={() => onSelect(group.id)}>{group.name}<small>{filterWatchGroup(items, group.id).length}</small></button>)}</div><button className="manage-groups" title="管理自选分组" onClick={onManage}>管理分组</button></div>
}

export function GroupManager({ groups, onCreate, onRename, onDelete, onClose }: { groups: WatchGroup[]; onCreate(name: string, id: string): Promise<boolean>; onRename(id: string, name: string): Promise<boolean>; onDelete(id: string): Promise<boolean>; onClose(): void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const create = async () => {
    const error = groupNameError(name, groups); if (error) return setError(error)
    setBusy(true); setError(undefined)
    try { if (await onCreate(name, crypto.randomUUID())) setName(''); else setError('保存失败，请重试') } catch (error) { setError(error instanceof Error ? error.message : '操作失败') } finally { setBusy(false) }
  }
  return <div className="overlay"><section className="panel group-panel"><div className="panel-head"><h2>管理自选分组</h2><button title="关闭分组管理" onClick={onClose}>×</button></div><form className="group-create" onSubmit={event => { event.preventDefault(); if (!busy) void create() }}><input aria-label="新分组名称" value={name} maxLength={20} placeholder="例如：长线、短线、观察" onChange={event => { setName(event.target.value); setError(undefined) }}/><button disabled={busy}>新建分组</button></form>{error && <p className="error">{error}</p>}<div className="group-manager-list">{groups.map(group => <GroupRow key={group.id} group={group} groups={groups} onRename={onRename} onDelete={onDelete}/>)}</div>{!groups.length && <p className="fineprint">创建分组后，在股票卡片中选择所属分组。</p>}<p className="fineprint">每只股票可放入一个分组。删除分组后，股票回到“未分组”，持仓和提醒会保留。</p></section></div>
}

function GroupRow({ group, groups, onRename, onDelete }: { group: WatchGroup; groups: WatchGroup[]; onRename(id: string, name: string): Promise<boolean>; onDelete(id: string): Promise<boolean> }) {
  const [name, setName] = useState(group.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  useEffect(() => setName(group.name), [group.name])
  const run = async (remove = false) => {
    const invalid = remove ? undefined : groupNameError(name, groups, group.id); if (invalid) return setError(invalid)
    setBusy(true); setError(undefined)
    try { const ok = await (remove ? onDelete(group.id) : onRename(group.id, name)); if (!ok) setError('保存失败，请重试') } catch (error) { setError(error instanceof Error ? error.message : '操作失败') } finally { setBusy(false) }
  }
  return <div className="group-manager-row" data-group-id={group.id}><form onSubmit={event => { event.preventDefault(); if (!busy) void run() }}><input aria-label={`分组名称：${group.name}`} value={name} maxLength={20} onChange={event => { setName(event.target.value); setError(undefined) }}/><button disabled={busy || name.trim() === group.name}>保存名称</button><button type="button" disabled={busy} onClick={() => setConfirmDelete(!confirmDelete)}>{confirmDelete ? '取消' : '删除'}</button></form>{confirmDelete && <div className="group-delete-confirm"><span>删除“{group.name}”？股票将回到未分组。</span><button disabled={busy} onClick={() => void run(true)}>确认删除</button></div>}{error && <p className="error">{error}</p>}</div>
}
