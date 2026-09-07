const { existsSync, readdirSync, rmSync } = require('node:fs')
const { join } = require('node:path')

module.exports = async context => {
  const localeDirectory = join(context.appOutDir, 'locales')
  if (!existsSync(localeDirectory)) return
  const keep = new Set(['zh-CN.pak', 'en-US.pak'])
  for (const name of readdirSync(localeDirectory)) {
    if (name.endsWith('.pak') && !keep.has(name)) rmSync(join(localeDirectory, name))
  }
}
