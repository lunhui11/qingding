import Store from 'electron-store'
import type { AppState } from './types'

export const defaults: AppState = {
  watchlist: [
    { market: 'SH', code: '000001', name: '上证指数' },
    { market: 'SH', code: '600519', name: '贵州茅台' },
    { market: 'HK', code: '00700', name: '腾讯控股' }
  ],
  alerts: [],
  todos: '今日待办\n\n□ 整理项目进度\n□ 跟进本周数据\n□ 准备会议材料',
  todoItems: [
    { id: 'welcome-1', text: '整理项目进度', tag: '工作', completed: false, createdAt: new Date().toISOString() },
    { id: 'welcome-2', text: '跟进本周数据', tag: '今日', completed: false, createdAt: new Date().toISOString() },
    { id: 'welcome-3', text: '准备会议材料', tag: '重要', completed: false, createdAt: new Date().toISOString() }
  ],
  todoLogs: [],
  settings: { refreshMs: 1000, idleRefreshMs: 15000, opacity: 0.96, colorMode: 'cn', shortcut: 'CommandOrControl+Alt+M', hideShortcut: 'CommandOrControl+Alt+H', notifications: true, launchAtLogin: false, locked: false, paused: false }
}

const store = new Store<AppState>({ name: 'market-float-settings', defaults })
export function getState(): AppState { const state = store.store; return { ...state, settings: { ...defaults.settings, ...state.settings, refreshMs: state.settings.refreshMs === 3000 ? 1000 : state.settings.refreshMs } } }
export function patchState(patch: Partial<AppState>): AppState {
  if (patch.watchlist) store.set('watchlist', patch.watchlist)
  if (patch.alerts) store.set('alerts', patch.alerts)
  if (typeof patch.todos === 'string') store.set('todos', patch.todos)
  if (patch.todoItems) store.set('todoItems', patch.todoItems)
  if (patch.todoLogs) store.set('todoLogs', patch.todoLogs)
  if (patch.settings) store.set('settings', { ...store.get('settings'), ...patch.settings })
  if (patch.windowBounds) store.set('windowBounds', patch.windowBounds)
  return getState()
}
