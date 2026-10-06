import { cn } from '@/utils/cn'

/** 印章标记（朱砂方印）：仅用于承载真实文化信息的位置 */
export default function SealMark({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn('seal', className)} aria-hidden>
      {text.slice(0, 2)}
    </span>
  )
}
