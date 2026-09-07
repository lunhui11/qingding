import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, Notification, screen, Tray } from 'electron'
import path from 'node:path'
import { fetchDetail, fetchQuotes, searchStocks } from './market'
import { getState, patchState } from './store'

process.env.ELECTRON_DISABLE_LOGGING = 'true'
app.commandLine.appendSwitch('disable-logging')

let win: BrowserWindow | null = null
let tray: Tray | null = null
let decoy = true
let quitting = false
let saveBoundsTimer: NodeJS.Timeout | undefined

function sendDecoy() { win?.webContents.send('decoy:changed', decoy); buildTrayMenu() }
function setDecoy(value: boolean) { decoy = value; sendDecoy(); return decoy }
function toggleDecoy() { if (!win?.isVisible()) win?.show(); win?.focus(); return setDecoy(!decoy) }

function normalizeBounds(saved?: Electron.Rectangle) {
  const area = screen.getDisplayMatching(saved ?? { x: 0, y: 0, width: 420, height: 560 }).workArea
  const width = Math.min(Math.max(saved?.width ?? 420, 360), area.width)
  const height = Math.min(Math.max(saved?.height ?? 560, 420), area.height)
  const x = saved && saved.x >= area.x - width + 80 && saved.x < area.x + area.width - 80 ? saved.x : area.x + area.width - width - 24
  const y = saved && saved.y >= area.y && saved.y < area.y + area.height - 60 ? saved.y : area.y + 24
  return { x, y, width, height }
}

function createWindow() {
  const saved = getState()
  const bounds = normalizeBounds(saved.windowBounds)
  win = new BrowserWindow({
    ...bounds, minWidth: 360, minHeight: 420, frame: false, transparent: false, alwaysOnTop: true,
    show: false, backgroundColor: '#101418', opacity: getState().settings.opacity,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  win.setMovable(!getState().settings.locked); win.setResizable(!getState().settings.locked)
  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) win.loadURL(devUrl); else win.loadFile(path.join(__dirname, '../dist/index.html'))
  win.once('ready-to-show', () => win?.show())
  win.on('close', e => { if (!quitting) { e.preventDefault(); win?.hide() } })
  win.on('move', scheduleSaveBounds); win.on('resize', scheduleSaveBounds)
}

function scheduleSaveBounds() {
  clearTimeout(saveBoundsTimer); saveBoundsTimer = setTimeout(() => { if (win && !win.isMaximized()) patchState({ windowBounds: win.getBounds() }) }, 300)
}

function registerShortcuts(tickerAccelerator: string, notesAccelerator: string, hideAccelerator: string) {
  globalShortcut.unregisterAll()
  try {
    const tickerOk = globalShortcut.register(tickerAccelerator, () => { if (!win?.isVisible()) win?.show(); win?.focus(); setDecoy(false) })
    const notesOk = globalShortcut.register(notesAccelerator, () => { if (!win?.isVisible()) win?.show(); win?.focus(); setDecoy(true) })
    const hideOk = globalShortcut.register(hideAccelerator, () => { if (!win) return; if (win.isVisible()) win.hide(); else { win.show(); win.focus() } })
    if (!tickerOk || !notesOk || !hideOk) { globalShortcut.unregisterAll(); return false }
    return true
  } catch { globalShortcut.unregisterAll(); return false }
}

function trayIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="8" fill="#171d23"/><path d="M6 21l6-7 5 4 8-10v13" fill="none" stroke="#55d6be" stroke-width="3" stroke-linecap="round"/></svg>`
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`).resize({ width: 16, height: 16 })
}

function buildTrayMenu() {
  if (!tray) return
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: win?.isVisible() ? '隐藏窗口' : '显示窗口', click: () => win?.isVisible() ? win.hide() : win?.show() },
    { label: getState().settings.paused ? '继续刷新' : '暂停刷新', click: () => { const s = getState(); patchState({ settings: { ...s.settings, paused: !s.settings.paused } }); win?.webContents.send('decoy:changed', decoy) } },
    { type: 'separator' }, { label: '退出轻盯', click: () => { quitting = true; app.quit() } }
  ]))
}

function createTray() {
  tray = new Tray(trayIcon()); tray.setToolTip('轻盯'); tray.on('click', () => { if (win?.isVisible()) win.hide(); else { win?.show(); win?.focus() } }); buildTrayMenu()
}

function setupIpc() {
  ipcMain.handle('state:load', () => getState())
  ipcMain.handle('state:save', (_, patch) => { const state = patchState(patch); buildTrayMenu(); return state })
  ipcMain.handle('market:quotes', (_, items) => fetchQuotes(items))
  ipcMain.handle('market:detail', (_, item) => fetchDetail(item))
  ipcMain.handle('market:search', (_, query) => searchStocks(String(query).slice(0, 30)))
  ipcMain.handle('window:toggle-decoy', toggleDecoy)
  ipcMain.handle('window:set-decoy', (_, value) => setDecoy(Boolean(value)))
  ipcMain.handle('window:opacity', (_, value) => win?.setOpacity(Math.min(1, Math.max(0.55, Number(value)))))
  ipcMain.handle('window:locked', (_, value) => { win?.setMovable(!value); win?.setResizable(!value) })
  ipcMain.handle('shortcut:update', (_, tickerValue, notesValue, hideValue) => { const ok = registerShortcuts(String(tickerValue), String(notesValue), String(hideValue)); return ok ? { ok: true } : { ok: false, error: '其中一个快捷键已被其他程序占用' } })
  ipcMain.handle('app:launch-at-login', (_, value) => app.setLoginItemSettings({ openAtLogin: Boolean(value), path: process.execPath }))
  ipcMain.handle('notify', (_, title, body) => { if (Notification.isSupported()) new Notification({ title, body, silent: true }).show() })
  ipcMain.handle('window:hide', () => win?.hide())
  ipcMain.handle('app:quit', () => { quitting = true; app.quit() })
}

app.whenReady().then(() => { setupIpc(); createWindow(); createTray(); const s = getState().settings; registerShortcuts(s.tickerShortcut, s.notesShortcut, s.hideShortcut) })
app.on('activate', () => win ? win.show() : createWindow())
app.on('before-quit', () => { quitting = true; globalShortcut.unregisterAll() })
app.on('window-all-closed', () => { /* tray application remains active until explicit quit */ })
