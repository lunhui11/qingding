import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, Notification, screen, Tray } from 'electron'
import path from 'node:path'
import { appendFileSync } from 'node:fs'
import { fetchDetail, fetchHotRank, fetchQuotes, fetchSectorRank, fetchSectorStocks, searchStocks } from './market'
import { getState, patchState } from './store'
import { createShortcutRegistry } from './shortcuts'

process.env.ELECTRON_DISABLE_LOGGING = 'true'
app.commandLine.appendSwitch('disable-logging')

let win: BrowserWindow | null = null
let tray: Tray | null = null
let decoy = true
let quitting = false
let saveBoundsTimer: NodeJS.Timeout | undefined
let shortcutError: string | undefined
function recordError(error: unknown) { try { appendFileSync(path.join(app.getPath('userData'), 'error.log'), `${new Date().toISOString()} ${error instanceof Error ? error.stack : String(error)}\n`) } catch {} }
function showWindow() { if (!win) return; if (win.isMinimized()) win.restore(); win.show(); win.focus() }
const shortcuts = createShortcutRegistry(globalShortcut, {
  tickerShortcut: () => { setDecoy(false); showWindow() },
  notesShortcut: () => { setDecoy(true); showWindow() },
  hideShortcut: () => { if (win?.isVisible()) win.hide(); else showWindow() }
})

function sendDecoy() { win?.webContents.send('decoy:changed', decoy); buildTrayMenu() }
function setDecoy(value: boolean) { decoy = value; sendDecoy(); return decoy }
function toggleDecoy() { if (!win?.isVisible()) win?.show(); win?.focus(); return setDecoy(!decoy) }

function normalizeBounds(saved?: Electron.Rectangle) {
  const area = screen.getDisplayMatching(saved ?? { x: 0, y: 0, width: 420, height: 560 }).workArea
  const width = Math.min(Math.max(saved?.width ?? 420, 360), area.width)
  const height = Math.min(Math.max(saved?.height ?? 560, 420), area.height)
  const x = Math.max(area.x, Math.min(saved?.x ?? area.x + area.width - width - 24, area.x + area.width - width))
  const y = Math.max(area.y, Math.min(saved?.y ?? area.y + 24, area.y + area.height - height))
  return { x, y, width, height }
}

function createWindow() {
  const saved = getState()
  const bounds = normalizeBounds(saved.windowBounds)
  win = new BrowserWindow({
    ...bounds, minWidth: 360, minHeight: 420, frame: false, transparent: false, alwaysOnTop: true,
    show: false, backgroundColor: '#101418', opacity: getState().settings.opacity, icon: path.join(__dirname, '../build/icon.png'),
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
  clearTimeout(saveBoundsTimer); saveBoundsTimer = setTimeout(() => { try { if (win && !win.isDestroyed() && !win.isMaximized()) patchState({ windowBounds: win.getBounds() }) } catch (error) { recordError(error) } }, 300)
}

function trayIcon() {
  return nativeImage.createFromPath(path.join(__dirname, '../build/icon.png')).resize({ width: 16, height: 16 })
}

function buildTrayMenu() {
  if (!tray) return
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: win?.isVisible() ? '隐藏窗口' : '显示窗口', click: () => win?.isVisible() ? win.hide() : showWindow() },
    { label: getState().settings.paused ? '继续刷新' : '暂停刷新', click: () => { try { const s = getState(); patchState({ settings: { ...s.settings, paused: !s.settings.paused } }); sendDecoy() } catch (error) { recordError(error) } } },
    { type: 'separator' }, { label: '退出轻盯', click: () => { quitting = true; app.quit() } }
  ]))
}

function createTray() {
  tray = new Tray(trayIcon()); tray.setToolTip('轻盯'); tray.on('click', () => { if (win?.isVisible()) win.hide(); else showWindow() }); buildTrayMenu()
}

function setupIpc() {
  ipcMain.handle('state:load', () => ({ ...getState(), settings: { ...getState().settings, ...shortcuts.values() } }))
  ipcMain.handle('state:save', (_, patch) => {
    if (patch?.settings) patch = { ...patch, settings: { ...patch.settings, ...shortcuts.values() } }
    const state = patchState(patch); buildTrayMenu(); return state
  })
  ipcMain.handle('market:quotes', async (_, items) => { try { return await fetchQuotes(items) } catch (error) { recordError(error); throw error } })
  ipcMain.handle('market:detail', (_, item, scope, threshold) => fetchDetail(item, scope, threshold))
  ipcMain.handle('market:hot-rank', () => fetchHotRank())
  ipcMain.handle('market:sector-rank', () => fetchSectorRank())
  ipcMain.handle('market:sector-stocks', (_, sector) => fetchSectorStocks(sector))
  ipcMain.handle('market:search', (_, query) => searchStocks(String(query).slice(0, 30)))
  ipcMain.handle('window:toggle-decoy', toggleDecoy)
  ipcMain.handle('window:set-decoy', (_, value) => setDecoy(Boolean(value)))
  ipcMain.handle('window:opacity', (_, value) => win?.setOpacity(Math.min(1, Math.max(0.55, Number(value)))))
  ipcMain.handle('window:locked', (_, value) => { win?.setMovable(!value); win?.setResizable(!value) })
  ipcMain.handle('shortcut:status', () => ({ values: shortcuts.values(), error: shortcutError }))
  ipcMain.handle('shortcut:update', (_, tickerValue, notesValue, hideValue) => {
    const result = shortcuts.update({ tickerShortcut: String(tickerValue), notesShortcut: String(notesValue), hideShortcut: String(hideValue) })
    shortcutError = result.error
    if (result.ok) { try { patchState({ settings: { ...getState().settings, ...result.values } }) } catch (error) { recordError(error); shortcutError = '快捷键已生效，但保存失败；重启前请重试应用'; return { ...result, error: shortcutError } } }
    return result
  })
  ipcMain.handle('app:launch-at-login', (_, value) => app.setLoginItemSettings({ openAtLogin: Boolean(value), path: process.execPath }))
  ipcMain.handle('notify', (_, title, body) => { if (Notification.isSupported()) new Notification({ title, body, silent: true }).show() })
  ipcMain.handle('window:hide', () => win?.hide())
  ipcMain.handle('app:quit', () => { quitting = true; app.quit() })
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) app.quit()
else {
  app.on('second-instance', showWindow)
  app.whenReady().then(() => {
    setupIpc()
    const registered = shortcuts.initialize(getState().settings); shortcutError = registered.error
    const { error, ...values } = registered
    if (Object.entries(values).some(([key, value]) => getState().settings[key as keyof typeof values] !== value)) {
      try { patchState({ settings: { ...getState().settings, ...values } }) } catch (error) { recordError(error); shortcutError = `${shortcutError ?? ''} 快捷键配置未能保存` }
    }
    createWindow(); createTray()
  }).catch(error => { recordError(error); app.quit() })
}
app.on('activate', () => win ? win.show() : createWindow())
app.on('before-quit', () => { quitting = true; clearTimeout(saveBoundsTimer); globalShortcut.unregisterAll() })
app.on('window-all-closed', () => { /* tray application remains active until explicit quit */ })
