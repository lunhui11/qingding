import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AppState } from './types'

export const defaults: AppState = {
  watchlist: [
    { market: 'SH', code: '000001', name: '上证指数' },
    { market: 'SH', code: '600519', name: '贵州茅台' },
    { market: 'HK', code: '00700', name: '腾讯控股' }
  ],
  alerts: [],
  todos: '今日待办\n\n□ 整理项目进度\n□ 跟进本周数据\n□ 准备会议材料',
  todoItems: [],
  todoLogs: [],
  settings: { refreshMs: 1000, idleRefreshMs: 15000, opacity: 0.96, theme: 'dark', colorMode: 'cn', tickerShortcut: 'F8', notesShortcut: 'F7', hideShortcut: 'F9', notifications: true, smartAlerts: true, launchAtLogin: false, locked: false, paused: false, commissionRate: 2.5, minimumCommission: 5, stampDutyRate: 0.05, compactMode: false, positionsFirst: true, watchSortMode: 'manual', largeOrderThreshold: 200000 }
}

let cached: AppState | undefined
const statePath = () => join(app.getPath('userData'), 'market-float-settings.json')

const loadFromDisk = (): AppState => {
  if (cached) return cached
  let saved: Partial<AppState> = {}
  try { if (existsSync(statePath())) saved = JSON.parse(readFileSync(statePath(), 'utf8')) as Partial<AppState> } catch { saved = {} }
  cached = {
    ...defaults,
    ...saved,
    watchlist: saved.watchlist ?? defaults.watchlist,
    alerts: saved.alerts ?? defaults.alerts,
    todoItems: (saved.todoItems ?? defaults.todoItems).filter(item => !item.id.startsWith('welcome-')),
    todoLogs: saved.todoLogs ?? defaults.todoLogs,
    settings: { ...defaults.settings, ...saved.settings, refreshMs: saved.settings?.refreshMs === 3000 ? 1000 : saved.settings?.refreshMs ?? defaults.settings.refreshMs }
  }
  return cached
}

const writeToDisk = (state: AppState) => {
  const file = statePath(); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(state, null, 2), 'utf8')
}

export function getState(): AppState {
  return loadFromDisk()
}
export function patchState(patch: Partial<AppState>): AppState {
  const current = loadFromDisk()
  cached = { ...current, ...patch, settings: patch.settings ? { ...current.settings, ...patch.settings } : current.settings }
  writeToDisk(cached)
  return cached
}
