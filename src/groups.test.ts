import { describe, expect, it } from 'vitest'
import type { AppState } from './types'
import { createWatchGroup, deleteWatchGroup, filterWatchGroup, moveStockToGroup, renameWatchGroup } from './groups'
const state: AppState = { watchGroups: [{ id: 'long', name: '长线' }, { id: 'short', name: '短线' }], watchlist: [
  { market: 'SH', code: '600519', name: 'A', groupId: 'long', costPrice: 10, holdingLots: 5 },
  { market: 'SZ', code: '000001', name: 'B' },
  { market: 'HK', code: '00700', name: 'C', groupId: 'long', hidden: true }
], alerts: [], todos: '', todoItems: [], todoLogs: [], settings: {} as AppState['settings'] }
describe('manual watchlist groups', () => {
  it('creates a trimmed group without changing stocks', () => {
    expect(createWatchGroup(state, '  观察  ', 'new').watchGroups.at(-1)).toEqual({ id: 'new', name: '观察' })
    expect(state.watchGroups).toHaveLength(2)
  })
  it('rejects duplicate, empty, long and reserved names', () => {
    for (const name of ['长线', ' ', 'x'.repeat(21), '全部自选', '未分组']) expect(() => createWatchGroup(state, name, 'new')).toThrow()
  })
  it('rejects duplicate or reserved identifiers', () => {
    for (const id of ['long', 'all', 'ungrouped', '']) expect(() => createWatchGroup(state, '观察', id)).toThrow()
  })
  it('renames a group while keeping its identifier and membership', () => {
    expect(renameWatchGroup(state, 'long', '长期').watchGroups[0]).toEqual({ id: 'long', name: '长期' })
    expect(state.watchlist[0].groupId).toBe('long')
    expect(() => renameWatchGroup(state, 'long', '短线')).toThrow()
  })
  it('deletes a group without deleting hidden stocks or positions', () => {
    const patch = deleteWatchGroup(state, 'long')
    expect(patch.watchGroups.map(group => group.id)).toEqual(['short'])
    expect(patch.watchlist).toHaveLength(3)
    expect(patch.watchlist[0]).toMatchObject({ groupId: undefined, costPrice: 10, holdingLots: 5 })
    expect(patch.watchlist[2]).toMatchObject({ groupId: undefined, hidden: true })
  })
  it('moves a stock once and preserves its position and other stocks', () => {
    const patch = moveStockToGroup(state, 'SH.600519', 'short')
    expect(patch.watchlist[0]).toMatchObject({ groupId: 'short', costPrice: 10, holdingLots: 5 })
    expect(patch.watchlist).toHaveLength(3); expect(patch.watchlist[1]).toEqual(state.watchlist[1])
    expect(state.watchlist[0].groupId).toBe('long')
  })
  it('can move back to ungrouped but rejects deleted groups', () => {
    expect(moveStockToGroup(state, 'SH.600519').watchlist[0].groupId).toBeUndefined()
    expect(() => moveStockToGroup(state, 'SH.600519', 'deleted')).toThrow()
  })
  it('filters groups without revealing hidden stocks', () => {
    expect(filterWatchGroup(state.watchlist, 'all').map(item => item.name)).toEqual(['A', 'B'])
    expect(filterWatchGroup(state.watchlist, 'ungrouped').map(item => item.name)).toEqual(['B'])
    expect(filterWatchGroup(state.watchlist, 'long').map(item => item.name)).toEqual(['A'])
    expect(filterWatchGroup(state.watchlist, 'short')).toEqual([])
  })
})
