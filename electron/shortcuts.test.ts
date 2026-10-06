import { expect, it } from 'vitest'
import { createShortcutRegistry } from './shortcuts'

it('keeps working keys on startup conflict; failed updates roll back and swaps work', () => {
  const occupied = new Set(['F9'])
  const registered = new Map<string, () => void>()
  const triggered: string[] = []
  const registry = createShortcutRegistry({ register: (key, callback) => { if (occupied.has(key) || registered.has(key)) return false; registered.set(key, callback); return true }, unregister: key => { registered.delete(key) } }, { tickerShortcut: () => { triggered.push('ticker') }, notesShortcut: () => { triggered.push('notes') }, hideShortcut: () => { triggered.push('hide') } })
  registry.initialize({ tickerShortcut: 'F8', notesShortcut: 'F7', hideShortcut: 'F9' })
  expect(registered.has('F8')).toBe(true)
  expect(registered.has('F7')).toBe(true)
  const previous = registry.values()
  expect(registry.update({ tickerShortcut: 'F9', notesShortcut: 'F7', hideShortcut: 'F10' }).ok).toBe(false)
  expect(registry.values()).toEqual(previous)
  expect(registry.update({ tickerShortcut: 'F7', notesShortcut: 'F8', hideShortcut: 'F10' }).ok).toBe(true)
  expect(registry.update({ tickerShortcut: 'F7', notesShortcut: 'F7', hideShortcut: 'F10' }).ok).toBe(false)
  expect(registered.size).toBe(3)
  registered.get('F7')!(); registered.get('F8')!(); registered.get('F10')!()
  expect(triggered).toEqual(['ticker', 'notes', 'hide'])
})
