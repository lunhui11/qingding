import type { AppState, WatchGroup, WatchItem } from './types'
import { secid } from './utils'

export function groupNameError(name: string, groups: WatchGroup[], exceptId?: string): string | undefined {
  const value = name.trim()
  if (!value) return '请输入分组名称'
  if (value.length > 20) return '分组名称最多 20 个字符'
  if (['全部自选', '未分组'].includes(value)) return '请使用其他分组名称'
  if (groups.some(group => group.id !== exceptId && group.name.toLowerCase() === value.toLowerCase())) return '分组名称已存在'
}
export function createWatchGroup(state: AppState, name: string, id: string): Pick<AppState, 'watchGroups'> {
  const error = groupNameError(name, state.watchGroups)
  if (error) throw new Error(error)
  if (!id || ['all', 'ungrouped'].includes(id) || state.watchGroups.some(group => group.id === id)) throw new Error('分组标识无效')
  return { watchGroups: [...state.watchGroups, { id, name: name.trim() }] }
}
export function renameWatchGroup(state: AppState, id: string, name: string): Pick<AppState, 'watchGroups'> {
  const error = groupNameError(name, state.watchGroups, id)
  if (error) throw new Error(error)
  if (!state.watchGroups.some(group => group.id === id)) throw new Error('分组不存在')
  return { watchGroups: state.watchGroups.map(group => group.id === id ? { ...group, name: name.trim() } : group) }
}
export function deleteWatchGroup(state: AppState, id: string): Pick<AppState, 'watchGroups' | 'watchlist'> {
  return { watchGroups: state.watchGroups.filter(group => group.id !== id), watchlist: state.watchlist.map(item => item.groupId === id ? { ...item, groupId: undefined } : item) }
}
export function moveStockToGroup(state: AppState, stockId: string, groupId?: string): Pick<AppState, 'watchlist'> {
  if (groupId && !state.watchGroups.some(group => group.id === groupId)) throw new Error('分组不存在')
  return { watchlist: state.watchlist.map(item => secid(item) === stockId ? { ...item, groupId: groupId || undefined } : item) }
}
export function filterWatchGroup(items: WatchItem[], filter: string): WatchItem[] {
  return items.filter(item => !item.hidden && (filter === 'all' || (filter === 'ungrouped' ? !item.groupId : item.groupId === filter)))
}
