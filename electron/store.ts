import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AppState } from './types'

export const defaults: AppState = {
  watchlist: [
    { market: 'SH', code: '000001', name: '上证指数' },
    { market: 'SH', code: '600519', name: '贵州茅台' },
    { market: 'HK', code: '00700', name: '腾讯控股' }
  ],
  watchGroups: [],
  alerts: [],
  todos: '今日待办\n\n□ 整理项目进度\n□ 跟进本周数据\n□ 准备会议材料',
  todoItems: [],
  todoLogs: [],
  settings: { refreshMs: 1000, idleRefreshMs: 15000, opacity: 0.96, theme: 'dark', colorMode: 'cn', tickerShortcut: 'F8', notesShortcut: 'F7', hideShortcut: 'F9', notifications: true, launchAtLogin: false, locked: false, paused: false, commissionRate: 2.5, minimumCommission: 5, stampDutyRate: 0.05, compactMode: false, positionsFirst: true, watchSortMode: 'manual', largeOrderThreshold: 200000 }
}

let cached: AppState | undefined
const statePath = () => join(app.getPath('userData'), 'market-float-settings.json')

export function normalizeState(input: unknown): AppState {
  const saved = input && typeof input === 'object' && !Array.isArray(input) ? input as Partial<AppState> : {}
  const settings = { ...defaults.settings }
  const supplied: Partial<AppState['settings']> = saved.settings && typeof saved.settings === 'object' ? saved.settings : {}
  for (const key of Object.keys(settings) as (keyof AppState['settings'])[]) {
    const value = supplied[key]
    if (typeof value === typeof settings[key] && (typeof value !== 'number' || Number.isFinite(value))) (settings as any)[key] = value
  }
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
  settings.refreshMs = clamp(settings.refreshMs, 1000, 60_000)
  settings.idleRefreshMs = clamp(settings.idleRefreshMs, 10_000, 300_000)
  settings.opacity = clamp(settings.opacity, .55, 1)
  settings.largeOrderThreshold = clamp(settings.largeOrderThreshold, 10_000, 100_000_000)
  for (const key of ['commissionRate', 'minimumCommission', 'stampDutyRate'] as const) settings[key] = clamp(settings[key], 0, 10000)
  if (!['dark', 'light'].includes(settings.theme)) settings.theme = defaults.settings.theme
  if (!['cn', 'global'].includes(settings.colorMode)) settings.colorMode = defaults.settings.colorMode
  if (!['manual', 'change', 'mainFlow', 'flow5m', 'flow10m', 'volumeRatio', 'profit'].includes(settings.watchSortMode)) settings.watchSortMode = 'manual'
  for (const key of ['tickerShortcut', 'notesShortcut', 'hideShortcut'] as const) settings[key] = settings[key].trim() || defaults.settings[key]
  const validTodo = (item: any) => item && typeof item.id === 'string' && typeof item.text === 'string' && !item.id.startsWith('welcome-')
  const todos = (items: unknown) => Array.isArray(items) ? items.filter(validTodo).map(item => ({ ...item, tag: typeof item.tag === 'string' ? item.tag : '', completed: item.completed === true })) : []
  const groupIds = new Set<string>(); const groupNames = new Set<string>()
  const watchGroups = Array.isArray(saved.watchGroups) ? saved.watchGroups.flatMap(group => {
    if (!group || typeof group.id !== 'string' || !group.id.trim() || group.id.length > 80 || ['all', 'ungrouped'].includes(group.id) || typeof group.name !== 'string') return []
    const name = group.name.trim(); const key = name.toLowerCase()
    if (!name || name.length > 20 || ['全部自选', '未分组'].includes(name) || groupIds.has(group.id) || groupNames.has(key)) return []
    groupIds.add(group.id); groupNames.add(key); return [{ id: group.id, name }]
  }) : []
  const seen = new Set<string>()
  const watchlist = Array.isArray(saved.watchlist) ? saved.watchlist.filter(item => {
    if (!item || !['SH', 'SZ', 'HK'].includes(item.market) || typeof item.code !== 'string' || !/^\d{1,6}$/.test(item.code) || typeof item.name !== 'string') return false
    if (item.market === 'HK' && item.code.length > 5) return false
    const id = `${item.market}.${item.code.padStart(item.market === 'HK' ? 5 : 6, '0')}`; if (seen.has(id)) return false; seen.add(id); return true
  }).map(item => { const next = { ...item, groupId: typeof item.groupId === 'string' && groupIds.has(item.groupId) ? item.groupId : undefined, code: item.code.padStart(item.market === 'HK' ? 5 : 6, '0'), hidden: item.hidden === true }; for (const key of ['costPrice', 'holdingLots', 'lotSize'] as const) if (next[key] != null && (!Number.isFinite(next[key]) || next[key]! < 0)) delete next[key]; return next }) : defaults.watchlist
  const bounds = saved.windowBounds
  return { ...defaults, watchGroups, watchlist, settings,
    todos: typeof saved.todos === 'string' ? saved.todos : '',
    alerts: Array.isArray(saved.alerts) ? saved.alerts.filter(rule => rule && typeof rule.id === 'string' && typeof rule.secid === 'string' && ['priceAbove', 'priceBelow', 'changeAbove', 'changeBelow'].includes(rule.metric) && Number.isFinite(rule.threshold)).map(rule => ({ ...rule, enabled: rule.enabled === true, lastTriggered: Number.isFinite(rule.lastTriggered) ? rule.lastTriggered : undefined })) : [],
    todoItems: todos(saved.todoItems),
    todoLogs: Array.isArray(saved.todoLogs) ? saved.todoLogs.filter(log => log && typeof log.id === 'string' && Number.isFinite(Date.parse(log.savedAt))).map(log => ({ ...log, items: todos(log.items) })) : [],
    windowBounds: bounds && [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) ? bounds : undefined
  }
}

const loadFromDisk = (): AppState => {
  if (cached) return cached
  let saved: unknown = {}
  try { if (existsSync(statePath())) saved = JSON.parse(readFileSync(statePath(), 'utf8')) } catch {
    try { copyFileSync(statePath(), `${statePath()}.corrupt`); saved = JSON.parse(readFileSync(`${statePath()}.bak`, 'utf8')) } catch { saved = {} }
  }
  cached = normalizeState(saved)
  return cached
}

const writeToDisk = (state: AppState) => {
  const file = statePath(); mkdirSync(dirname(file), { recursive: true })
  writeFileSync(`${file}.tmp`, JSON.stringify(state, null, 2), 'utf8')
  if (existsSync(file)) {
    // Do not replace a recoverable backup with the corrupt file we just recovered from.
    let valid = false; try { JSON.parse(readFileSync(file, 'utf8')); valid = true } catch {}
    if (valid) copyFileSync(file, `${file}.bak`)
  }
  renameSync(`${file}.tmp`, file)
}

export function getState(): AppState {
  return loadFromDisk()
}
export function patchState(patch: Partial<AppState>): AppState {
  const current = loadFromDisk()
  const next = normalizeState({ ...current, ...patch, settings: patch.settings ? { ...current.settings, ...patch.settings } : current.settings })
  writeToDisk(next)
  cached = next
  return cached
}
