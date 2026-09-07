import { contextBridge, ipcRenderer } from 'electron'
import type { AppState, WatchItem } from './types'

contextBridge.exposeInMainWorld('marketFloat', {
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (patch: Partial<AppState>) => ipcRenderer.invoke('state:save', patch),
  fetchQuotes: (items: WatchItem[]) => ipcRenderer.invoke('market:quotes', items),
  fetchDetail: (item: WatchItem) => ipcRenderer.invoke('market:detail', item),
  searchStocks: (query: string) => ipcRenderer.invoke('market:search', query),
  toggleDecoy: () => ipcRenderer.invoke('window:toggle-decoy'),
  setDecoy: (value: boolean) => ipcRenderer.invoke('window:set-decoy', value),
  setWindowOpacity: (value: number) => ipcRenderer.invoke('window:opacity', value),
  setWindowLocked: (value: boolean) => ipcRenderer.invoke('window:locked', value),
  updateShortcut: (tickerValue: string, notesValue: string, hideValue: string) => ipcRenderer.invoke('shortcut:update', tickerValue, notesValue, hideValue),
  setLaunchAtLogin: (value: boolean) => ipcRenderer.invoke('app:launch-at-login', value),
  notify: (title: string, body: string) => ipcRenderer.invoke('notify', title, body),
  hideWindow: () => ipcRenderer.invoke('window:hide'),
  quit: () => ipcRenderer.invoke('app:quit'),
  onDecoyChanged: (callback: (value: boolean) => void) => {
    const listener = (_: unknown, value: boolean) => callback(value)
    ipcRenderer.on('decoy:changed', listener)
    return () => ipcRenderer.removeListener('decoy:changed', listener)
  }
})
