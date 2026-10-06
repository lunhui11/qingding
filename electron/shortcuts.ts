type ShortcutKey = 'tickerShortcut' | 'notesShortcut' | 'hideShortcut'
export type ShortcutValues = Record<ShortcutKey, string>
const keys: ShortcutKey[] = ['tickerShortcut', 'notesShortcut', 'hideShortcut']
const labels = ['打开盯盘', '打开便签', '隐藏/恢复']

export function createShortcutRegistry(api: { register(key: string, callback: () => void): boolean; unregister(key: string): void }, callbacks: Record<ShortcutKey, () => void>) {
  let active: Partial<ShortcutValues> = {}
  const attempt = (key: ShortcutKey, value: string) => { try { return api.register(value, callbacks[key]) } catch { return false } }
  return {
    initialize(values: ShortcutValues) {
      const warnings: string[] = []
      keys.forEach((key, index) => {
        const requested = typeof values[key] === 'string' ? values[key].trim() : ''
        for (const candidate of [...new Set([requested, ['F8', 'F7', 'F9'][index], `Ctrl+Alt+Shift+F${index + 7}`])]) {
          if (!candidate || Object.values(active).some(value => value.toLowerCase() === candidate.toLowerCase())) continue
          if (attempt(key, candidate)) { active[key] = candidate; break }
        }
        if (active[key] !== requested) warnings.push(`${labels[index]}：${active[key] ? `改用 ${active[key]}` : '注册失败，请在设置中更换'}`)
      })
      return { ...active, error: warnings.join('；') || undefined }
    },
    update(values: ShortcutValues) {
      const next = Object.fromEntries(keys.map(key => [key, values[key]?.trim() ?? ''])) as ShortcutValues
      if (keys.some(key => !next[key]) || new Set(keys.map(key => next[key].toLowerCase())).size !== 3) return { ok: false, error: '三个快捷键必须填写且不能重复', values: { ...active } }
      const previous = { ...active }
      Object.values(active).forEach(value => api.unregister(value))
      active = {}
      const failed = keys.find(key => { if (!attempt(key, next[key])) return true; active[key] = next[key]; return false })
      if (!failed) return { ok: true, values: { ...active } }
      Object.values(active).forEach(value => api.unregister(value))
      active = {}
      keys.forEach(key => { if (previous[key] && attempt(key, previous[key]!)) active[key] = previous[key] })
      return { ok: false, error: `${labels[keys.indexOf(failed)]}快捷键无效或已被占用，已保留原快捷键`, values: { ...active } }
    },
    values: () => ({ ...active })
  }
}
