// Runs the real Electron main/preload/React app with deterministic market fixtures.
// Uses an isolated configuration directory; never reads or edits the user's own config.
const { app, BrowserWindow, globalShortcut } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..')
const packaged = process.argv.includes('--packaged')
const appRoot = packaged ? path.join(root, 'release', 'win-unpacked', 'resources', 'app.asar') : root
const output = path.join(root, 'outputs', 'qa')
fs.mkdirSync(output, { recursive: true })
const profile = fs.mkdtempSync(path.join(output, 'smoke-profile-'))
app.setPath('userData', profile)
const market = require(path.join(appRoot, 'dist-electron', 'market.js'))
const calls = []; const errors = []; const checks = []
let offline = false; let shortCharts = false; let failSaves = false
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const check = name => { checks.push(name); fs.appendFileSync(path.join(output, 'smoke-progress.log'), `PASS ${name}\n`); console.log(`PASS ${name}`) }
market.fetchQuotes = async items => {
  await sleep(80)
  return items.map(item => ({ ...item, price: offline ? null : 12, previousClose: 10, change: 2, changePercent: 20, mainNetInflow: offline ? null : 1230000, mainNetRatio: 10, superLargeNet: 600000, largeNet: 630000, amount: 120000000, volumeRatio: 2, actualTurnoverRate: 1.2, bid1Price: null, bid1Volume: null, ask1Price: null, ask1Volume: null, updatedAt: new Date().toISOString(), status: offline ? 'offline' : 'live' }))
}
market.searchStocks = async query => { await sleep(query === 'old' ? 900 : 30); return [{ market: 'SZ', code: query === 'old' ? '000001' : '000002', name: query === 'old' ? '旧结果' : '新结果' }] }
market.fetchSectorRank = async () => [{ code: 'BK001', name: '测试板块', kind: 'industry', changePercent: 5, mainNetInflow: 1230000, mainNetRatio: 10 }]
market.fetchSectorStocks = async () => [{ ...(await market.fetchQuotes([{ market: 'SZ', code: '000002', name: '板块龙头' }]))[0], leaderLabels: ['涨幅龙头'], popularityRank: 1 }]
market.fetchHotRank = async () => [{ ...(await market.fetchQuotes([{ market: 'SZ', code: '000002', name: '人气股' }]))[0], rank: 1, rankChange: 0 }]
market.fetchDetail = async (item, scope, threshold) => {
  calls.push({ code: item.code, scope }); await sleep(calls.length === 1 ? 900 : 60)
  const rows = Array.from({ length: shortCharts ? 2 : 30 }, (_, i) => `2026-10-06 10:${String(i).padStart(2, '0')},10,12,12,10,100,120000`)
  const intraday = market.buildIntraday(rows, item.market)
  const trades = Array.from({ length: 40 }, (_, i) => ({ time: `10:${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`, price: 12, volume: 300, side: i % 2 ? 1 : 2 }))
  return { intraday, price: intraday.map(v => ({ time: v.time, value: v.close })), averagePrice: intraday.map(v => ({ time: v.time, value: v.average })), capital: [{ time: '2026-10-05', value: 1000 }, { time: '2026-10-06', value: 3000 }], minuteCapital: market.buildEstimatedCapitalTrend(trades, item.market, threshold), trades, institutionActivity: market.estimateInstitutionActivity(trades, item.market, threshold), quantActivity: market.estimateQuantActivity(trades, item.market, threshold), flow5m: 360000, flow10m: 720000, flow5mTradeCount: 10, flow10mTradeCount: 20, flowCoverageMinutes: 10, klines: intraday.map((v, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, open: 10, close: 12, high: 13, low: 9, volume: 100, amount: 120000 })), updatedAt: new Date().toISOString(), tradeDate: '2026-10-06', book: { bid1Price: 11.99, bid1Volume: 80, ask1Price: 12.01, ask1Volume: 90, updatedAt: new Date().toISOString() } }
}
const store = require(path.join(appRoot, 'dist-electron', 'store.js'))
const originalPatch = store.patchState
store.patchState = patch => { if (failSaves) throw new Error('simulated disk failure'); return originalPatch(patch) }
app.on('web-contents-created', (_, contents) => {
  contents.on('render-process-gone', (_, details) => errors.push(`renderer: ${details.reason}`))
  contents.on('preload-error', (_, __, error) => errors.push(`preload: ${error.message}`))
  contents.on('console-message', details => { if (details.level === 'error' && !details.message.includes('simulated disk failure')) errors.push(details.message) })
})
require(path.join(appRoot, 'dist-electron', 'main.js'))
async function run() {
  await app.whenReady()
  let win
  for (let i = 0; i < 100; i++) { win = BrowserWindow.getAllWindows()[0]; if (win && !win.webContents.isLoadingMainFrame()) break; await sleep(50) }
  assert(win, 'window not created')
  const js = code => win.webContents.executeJavaScript(code, true)
  const wait = async (code, timeout = 7000) => { const start = Date.now(); while (Date.now() - start < timeout) { if (await js(code)) return; await sleep(50) }; throw new Error(`UI timeout: ${code}`) }
  const click = selector => js(`document.querySelector(${JSON.stringify(selector)}).click()`)
  const input = (selector, value) => js(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); })()`)
  await wait("!!document.querySelector('.decoy-v2') && !!window.marketFloat")
  await wait("document.querySelector('.decoy-actions')?.innerText.includes('0 / 0')")
  assert.equal(calls.length, 0); check('default notes mode, no detail requests or seeded tasks')
  const shortcuts = await js('window.marketFloat.shortcutStatus()')
  for (const key of Object.values(shortcuts.values)) assert(globalShortcut.isRegistered(key), `not registered: ${key}`)
  check('all three global shortcuts registered with Windows')
  await click('.todo-add'); await wait("!!document.querySelector('.todo-text')")
  for (const text of ['写', '写今天', '写今天的工作', '写今天的工作规划：检查项目']) { await input('.todo-text', text); await sleep(5) }
  await input('.tag-input', '项目'); await click('.todo-check')
  await wait("window.marketFloat.loadState().then(s=>s.todoItems[0]?.text==='写今天的工作规划：检查项目' && s.todoItems[0]?.tag==='项目' && s.todoItems[0]?.completed)")
  check('rapid notes typing, custom tags and completion persist without lost characters')
  await click('.decoy-actions button'); await wait('window.marketFloat.loadState().then(s=>s.todoLogs.length===1)')
  await click('[title="工作日志"]'); await wait("!!document.querySelector('.log-card')")
  await click('[title="删除这条日志"]'); await wait('window.marketFloat.loadState().then(s=>s.todoLogs.length===0)')
  check('save and delete daily log')
  await click('[title="偏好设置"]'); await wait("!!document.querySelector('.settings-panel')")
  assert(!(await js("document.querySelector('.settings-panel').innerText")).includes('佣金')); check('settings accessible from notes without financial indicators')
  const keysBefore = shortcuts.values
  // Use the field collection (not nth-of-type, since optional settings differ per mode).
  await js(`(() => { const fields=document.querySelectorAll('.shortcut-field input'); const values=${JSON.stringify([keysBefore.notesShortcut, keysBefore.tickerShortcut, keysBefore.hideShortcut])}; fields.forEach((e,i)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,values[i]);e.dispatchEvent(new Event('input',{bubbles:true}))}); })()`)
  await click('.apply-shortcuts')
  await wait(`window.marketFloat.shortcutStatus().then(s=>s.values.tickerShortcut===${JSON.stringify(keysBefore.notesShortcut)})`)
  check('swap ticker and notes shortcuts without self-conflict')
  const active = await js('window.marketFloat.shortcutStatus()')
  const duplicate = await js(`window.marketFloat.updateShortcut(${JSON.stringify(active.values.tickerShortcut)},${JSON.stringify(active.values.tickerShortcut)},${JSON.stringify(active.values.hideShortcut)})`)
  assert.equal(duplicate.ok, false)
  for (const key of Object.values(active.values)) assert(globalShortcut.isRegistered(key))
  check('invalid duplicate shortcut keeps working registrations')
  await click('.panel-head button'); await click('[title="今日规划"]')
  failSaves = true; await input('.todo-text', '保存失败时不丢掉编辑内容')
  await wait("document.querySelector('.decoy-v2 .error')?.innerText.includes('保存失败')")
  failSaves = false
  await click('[title="偏好设置"]'); await wait("!!document.querySelector('.settings-panel')")
  await js("(() => { const e=document.querySelector('input[type=range]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'95');e.dispatchEvent(new Event('input',{bubbles:true})); })()")
  await wait("window.marketFloat.loadState().then(s=>s.todoItems[0]?.text==='保存失败时不丢掉编辑内容')"); await click('.panel-head > button')
  check('saving a different setting retries previously failed notes instead of silently discarding them')
  await input('.todo-text', '写今天的工作规划：检查项目')
  await wait("window.marketFloat.loadState().then(s=>s.todoItems[0]?.text==='写今天的工作规划：检查项目')")
  check('failed save is visible and later successful edit recovers')
  await js('window.marketFloat.setDecoy(false)'); await wait("document.querySelectorAll('.stock-main').length===3")
  await wait("document.querySelector('.quote b').innerText==='12.00'")
  await click('[data-stock-id="SH.000001"] .stock-main'); await sleep(120); await click('[data-stock-id="SH.600519"] .stock-main')
  await wait("!!document.querySelector('[data-stock-id=\"SH.600519\"] .candlestick')")
  assert(calls.some(v => v.code === '600519' && v.scope === 'full')); check('fast stock switching loads full second-stock history and charts')
  assert((await js("document.querySelector('.top-book').innerText")).includes('12.01')); check('book displays fixture ask/bid prices and quantities')
  await input('.position-form label:first-child input', '10'); await input('.position-form label:nth-child(2) input', '5'); await click('.position-form > button')
  await wait("document.querySelector('.position-profit')?.innerText.includes('987.00')")
  check('position net profit deducts commissions and stamp duty')
  await click('[title="切换亮色"]'); await wait("document.querySelector('.app-shell').dataset.theme==='light'")
  await click('[title="设置"]')
  await wait("!!document.querySelector('.settings-panel')")
  await js("(() => { const e=[...document.querySelectorAll('.settings-panel select')].find(e=>e.value==='cn'); e.value='global';e.dispatchEvent(new Event('change',{bubbles:true})); })()")
  await wait("getComputedStyle(document.querySelector('.app-shell')).getPropertyValue('--rise').trim()==='#16885c'")
  await click('.panel-head button'); check('light theme and green-up palette apply consistently to text and charts')
  await js("(() => { const e=document.querySelector('.intraday-chart'); const b=e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('mousemove',{clientX:b.right-20,clientY:b.top+20,bubbles:true})); })()")
  shortCharts = true
  await wait("document.querySelectorAll('.candlestick g').length===2", 9000)
  check('hovered charts survive a shorter replacement dataset')
  await sleep(500); const image = await win.webContents.capturePage(); fs.writeFileSync(path.join(output, 'ticker.png'), image.toPNG())
  await click('[title="热门板块 TOP 10"]'); await wait("!!document.querySelector('.sector-row')"); await click('.sector-row'); await wait("document.querySelector('.sector-stock-list')?.innerText.includes('涨幅龙头')"); await click('.back-button'); await wait("!!document.querySelector('.sector-row')"); await click('.panel-head > button'); check('sector drill-down, leader label and back navigation')
  await click('.detail-actions button:nth-child(2)'); await wait("!document.querySelector('[data-stock-id=\"SH.600519\"]')"); await click('.tool-actions .add'); await wait("!!document.querySelector('.hidden-stocks button')"); await click('.hidden-stocks button'); await click('.panel-head > button'); await wait("!!document.querySelector('[data-stock-id=\"SH.600519\"]')"); check('hidden stock can be restored without duplicating its saved position')
  await click('.tool-actions .add'); await input('.searchbox input', 'old'); await sleep(350); await input('.searchbox input', 'new'); await wait("document.querySelector('.results').innerText.includes('新结果')"); await sleep(800); assert(!(await js("document.querySelector('.results').innerText")).includes('旧结果')); await click('.panel-head > button'); check('slow previous search cannot replace a newer query')
  offline = true; await wait("document.querySelector('.status-text').innerText.includes('连接异常')", 9000)
  assert.equal(await js("document.querySelector('.quote b').innerText"), '12.00'); check('offline quotes retain last valid displayed price')
  await js('window.marketFloat.setDecoy(true)'); await wait("!!document.querySelector('.todo-text')")
  assert(!(await js('document.body.innerText')).includes('贵州茅台')); const notesImage = await win.webContents.capturePage(); fs.writeFileSync(path.join(output, 'notes.png'), notesImage.toPNG())
  await js('window.marketFloat.hideWindow()'); assert.equal(win.isVisible(), false); win.minimize(); win.restore(); win.show(); assert.equal(win.isVisible(), true); check('notes mode has no ticker content and window hides/restores')
  win.webContents.reload(); await wait("!!document.querySelector('.todo-text')"); await wait("document.querySelector('.todo-text').value==='写今天的工作规划：检查项目'"); assert.equal((await js('window.marketFloat.loadState()')).todoLogs.length, 0); check('reload preserves notes and does not resurrect deleted logs')
  assert.deepEqual(errors, [], 'renderer/preload errors')
  fs.writeFileSync(path.join(output, packaged ? 'packaged-smoke-result.json' : 'smoke-result.json'), JSON.stringify({ checkedAt: new Date().toISOString(), passed: checks, errors, profile, fixtureData: true, packaged, osShortcutRegistrationOnly: true }, null, 2))
  console.log(`SMOKE PASSED: ${checks.length} checks; profile ${profile}`)
  app.exit(0)
}
const watchdog = setTimeout(() => { fs.writeFileSync(path.join(output, 'smoke-failure.txt'), `Smoke test timeout\n${JSON.stringify({ checks, errors })}`); console.error('Smoke test timeout'); app.exit(1) }, 60000)
run().catch(error => { fs.writeFileSync(path.join(output, 'smoke-failure.txt'), `${error.stack}\n${JSON.stringify(errors)}`); console.error(error); clearTimeout(watchdog); app.exit(1) })
