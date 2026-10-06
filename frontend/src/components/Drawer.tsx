import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  side?: 'left' | 'right'
}

/** 使用原生 <dialog> 的抽屉，避免 overflow 裁剪与堆叠上下文问题 */
export default function Drawer({ open, onClose, title, children, side = 'right' }: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className={`fixed inset-y-0 ${side === 'right' ? 'right-0' : 'left-0'} m-0 h-full max-h-none w-80 max-w-[85vw] border-line bg-surface p-0 shadow-xl backdrop:bg-black/30 ${side === 'right' ? 'border-l' : 'border-r'}`}
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-serif text-lg font-bold text-inkgreen">{title}</h2>
          <button type="button" onClick={onClose} className="btn-ghost min-h-9 px-2 py-1 text-sm" aria-label="关闭">
            关闭
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </dialog>
  )
}
