import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const location = vi.hoisted(() => ({ directory: '' }))
vi.mock('electron', () => ({ app: { getPath: () => location.directory } }))
vi.mock('node:fs', async importOriginal => { const actual = await importOriginal<typeof import('node:fs')>(); return { ...actual, renameSync: vi.fn(actual.renameSync) } })
let store: typeof import('./store')
const file = () => join(location.directory, 'market-float-settings.json')
beforeEach(async () => { location.directory = fs.mkdtempSync(join(tmpdir(), 'qingding-test-')); vi.resetModules(); store = await import('./store') })
afterEach(() => { vi.restoreAllMocks(); for (const name of fs.readdirSync(location.directory)) fs.unlinkSync(join(location.directory, name)); fs.rmdirSync(location.directory) })
describe('configuration persistence', () => {
  it('keeps saved 3-second refresh, empty notes and cleared logs', () => {
    fs.writeFileSync(file(), JSON.stringify({ settings: { refreshMs: 3000 }, todoItems: [], todoLogs: [] }))
    expect(store.getState()).toMatchObject({ settings: { refreshMs: 3000 }, todoItems: [], todoLogs: [] })
  })
  it('validates malformed state and normalizes duplicate stock codes', () => {
    const state = store.normalizeState({ settings: { refreshMs: 'bad', opacity: 4, theme: 'other' }, watchlist: [{ market: 'HK', code: '700', name: 'a' }, { market: 'HK', code: '00700', name: 'b' }, null], todoItems: {}, todoLogs: [null, { id: 'bad', savedAt: 'bad' }], alerts: null })
    expect(state.watchlist).toMatchObject([{ market: 'HK', code: '00700' }]); expect(state.watchlist).toHaveLength(1)
    expect(state.settings).toMatchObject({ refreshMs: 1000, opacity: 1, theme: 'dark' }); expect(state.todoItems).toEqual([]); expect(state.todoLogs).toEqual([])
  })
  it('retains the previous version in the backup after a successful save', () => {
    store.patchState({ todos: 'first' }); store.patchState({ todos: 'second' })
    expect(JSON.parse(fs.readFileSync(file() + '.bak', 'utf8')).todos).toBe('first')
    expect(JSON.parse(fs.readFileSync(file(), 'utf8')).todos).toBe('second')
  })
  it('does not change cached state or overwrite the good file on replacement failure', () => {
    store.patchState({ todos: 'first' }); vi.mocked(fs.renameSync).mockImplementationOnce(() => { throw new Error('disk unavailable') })
    expect(() => store.patchState({ todos: 'lost' })).toThrow('disk unavailable')
    expect(store.getState().todos).toBe('first'); expect(JSON.parse(fs.readFileSync(file(), 'utf8')).todos).toBe('first')
  })
  it('recovers corrupt JSON from backup and does not overwrite that backup with corruption', () => {
    fs.writeFileSync(file(), '{'); fs.writeFileSync(file() + '.bak', JSON.stringify({ todos: 'recover me' }))
    expect(store.getState().todos).toBe('recover me'); store.patchState({ todos: 'recovered' })
    expect(JSON.parse(fs.readFileSync(file() + '.bak', 'utf8')).todos).toBe('recover me')
    expect(fs.readFileSync(file() + '.corrupt', 'utf8')).toBe('{')
  })
})

describe('watchlist group migration and persistence', () => {
  it('migrates old configurations without losing holdings', () => {
    const state = store.normalizeState({ watchlist: [{ market: 'SH', code: '600519', name: 'A', costPrice: 10, holdingLots: 5 }] })
    expect(state.watchGroups).toEqual([])
    expect(state.watchlist[0]).toMatchObject({ code: '600519', costPrice: 10, holdingLots: 5, groupId: undefined })
  })
  it('cleans malformed groups and orphaned memberships', () => {
    const state = store.normalizeState({ watchGroups: [null, { id: 'long', name: ' 长线 ' }, { id: 'long', name: '重复标识' }, { id: 'other', name: '长线' }, { id: 'all', name: '保留标识' }, { id: 'blank', name: '' }], watchlist: [{ market: 'SH', code: '600519', name: 'A', groupId: 'long' }, { market: 'SZ', code: '000001', name: 'B', groupId: 'gone' }] })
    expect(state.watchGroups).toEqual([{ id: 'long', name: '长线' }])
    expect(state.watchlist.map(item => item.groupId)).toEqual(['long', undefined])
  })
  it('persists groups and stock membership across a fresh store load', async () => {
    store.patchState({ watchGroups: [{ id: 'long', name: '长线' }], watchlist: [{ market: 'SH', code: '600519', name: 'A', groupId: 'long', costPrice: 10, holdingLots: 5 }] })
    vi.resetModules(); const fresh = await import('./store')
    expect(fresh.getState().watchGroups).toEqual([{ id: 'long', name: '长线' }])
    expect(fresh.getState().watchlist[0]).toMatchObject({ groupId: 'long', costPrice: 10, holdingLots: 5 })
  })
  it('deleting groups normalizes saved stocks back to ungrouped', () => {
    store.patchState({ watchGroups: [{ id: 'long', name: '长线' }], watchlist: [{ market: 'HK', code: '00700', name: 'A', groupId: 'long', hidden: true, costPrice: 10 }] })
    const next = store.patchState({ watchGroups: [] })
    expect(next.watchlist[0]).toMatchObject({ groupId: undefined, hidden: true, costPrice: 10 })
  })
})
