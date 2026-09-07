import { CheckCircle2 } from 'lucide-react'
export default function Decoy({ value, onChange, onRestore }: { value: string; onChange(value: string): void; onRestore(): void }) {
  return <main className="decoy">
    <div className="decoy-header"><div><small>WORKSPACE</small><h1>今日待办</h1></div><CheckCircle2 size={24}/></div>
    <textarea value={value} onChange={e => onChange(e.target.value)} spellCheck={false} aria-label="今日待办"/>
    <footer><span>内容已自动保存</span><button onClick={onRestore} title="返回">⌃⌥ M</button></footer>
  </main>
}
