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
  settings: { refreshMs: 3000, idleRefreshMs: 15000, opacity: 0.96, colorMode: 'cn', shortcut: 'CommandOrControl+Alt+M', notifications: true, launchAtLogin: false, locked: false, paused: false }
}

const store = new Store<AppState>({ name: 'market-float-settings', defaults })
export function getState(): AppState { return store.store }
export function patchState(patch: Partial<AppState>): AppState {
  if (patch.watchlist) store.set('watchlist', patch.watchlist)
  if (patch.alerts) store.set('alerts', patch.alerts)
  if (typeof patch.todos === 'string') store.set('todos', patch.todos)
  if (patch.settings) store.set('settings', { ...store.get('settings'), ...patch.settings })
  if (patch.windowBounds) store.set('windowBounds', patch.windowBounds)
  return store.store
}
