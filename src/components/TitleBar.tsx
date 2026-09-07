import { EyeOff, GripHorizontal, Lock, LockOpen, Minus, Settings } from 'lucide-react'
export default function TitleBar({ locked, status, onLock, onSettings, onDecoy, onHide }: { locked: boolean; status: string; onLock(): void; onSettings(): void; onDecoy(): void; onHide(): void }) {
  return <header className="titlebar">
    <div className="drag-region"><span className="brand-dot"/><b>轻盯</b><span className="status-text">{status}</span><GripHorizontal size={14}/></div>
    <div className="window-actions">
      <button title={locked ? '解锁窗口' : '锁定位置'} onClick={onLock}>{locked ? <Lock size={15}/> : <LockOpen size={15}/>}</button>
      <button title="设置" onClick={onSettings}><Settings size={15}/></button>
      <button title="切换到工作便签" onClick={onDecoy}><EyeOff size={15}/></button>
      <button title="隐藏到托盘" onClick={onHide}><Minus size={16}/></button>
    </div>
  </header>
}
