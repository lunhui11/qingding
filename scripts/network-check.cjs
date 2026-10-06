// Read-only live provider check. This is separate from the deterministic UI smoke test.
const { app, net, session } = require('electron')
const fs = require('node:fs'); const path = require('node:path')
const output = path.resolve(__dirname, '../outputs/qa'); fs.mkdirSync(output, { recursive: true })
app.setPath('userData', fs.mkdtempSync(path.join(output, 'network-profile-')))
app.commandLine.appendSwitch('disable-logging')
const watchdog = setTimeout(() => app.exit(1), 45000)
app.whenReady().then(async () => {
  const direct = session.fromPartition('probe-direct', { cache: false }); await direct.setProxy({ mode: 'direct' })
  const sources = [
    ['Tencent', 'https://qt.gtimg.cn/q=sh600519,hk00700'],
    ['Eastmoney', 'https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=f12,f13,f2,f62,f66,f72,f124&secids=1.600519,116.00700'],
    ['Trades', 'https://push2.eastmoney.com/api/qt/stock/details/get?secid=1.600519&fields1=f1,f2,f3,f4,f5&fields2=f51,f52,f53,f54,f55&pos=-3'],
    ['Intraday', 'https://push2his.eastmoney.com/api/qt/stock/trends2/get?secid=1.600519&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11&fields2=f51,f52,f53,f54,f55,f56,f57,f58&ndays=1&iscr=0']
  ]
  const results = await Promise.all(sources.flatMap(([source, url]) => [false, true].map(async useDirect => {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12000); const start = Date.now()
    try {
      const response = await (useDirect ? direct.fetch(url, { signal: controller.signal }) : net.fetch(url, { signal: controller.signal }))
      const bytes = await response.arrayBuffer(); const text = new TextDecoder(source === 'Tencent' ? 'gbk' : 'utf8').decode(bytes)
      const sample = source === 'Tencent' ? [...text.matchAll(/v_([^=]+)="([^"]*)"/g)].map(row => { const v=row[2].split('~'); return { symbol: row[1], fields: v.length, price: v[3], bidPrice: v[9], bidVolume: v[10], askPrice: v[19], askVolume: v[20], timestamp: v[30] } }) : JSON.parse(text)
      if (source === 'Intraday' && sample?.data?.trends) sample.data.trends = sample.data.trends.slice(0, 3)
      return { source, route: useDirect ? 'direct' : 'system', ok: response.ok, milliseconds: Date.now() - start, sample }
    } catch (error) { return { source, route: useDirect ? 'direct' : 'system', ok: false, milliseconds: Date.now() - start, error: error.message } }
    finally { clearTimeout(timer) }
  })))
  fs.writeFileSync(path.join(output, 'network-result.json'), JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2)); clearTimeout(watchdog); app.exit(0)
}).catch(error => { console.error(error); app.exit(1) })
