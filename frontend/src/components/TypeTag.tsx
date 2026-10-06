import { knowledgeTypeLabel } from '@/data/codex'
import type { KnowledgeType } from '@/types'
import { cn } from '@/utils/cn'

/**
 * 文化内容四级标签。
 * 可访问性红线：不只依赖颜色——每级同时使用图标形状 + 文字 + 色彩三通道。
 */
const config: Record<KnowledgeType, { icon: string; className: string }> = {
  fact: { icon: '●', className: 'border-inkgreen/40 bg-inkgreen/10 text-inkgreen' },
  disputed: { icon: '▲', className: 'border-warning/50 bg-warning/10 text-[oklch(0.42_0.1_65)]' },
  legend: { icon: '◆', className: 'border-bronze/50 bg-bronze/10 text-[oklch(0.45_0.07_75)]' },
  fiction: { icon: '○', className: 'border-bluegray/40 bg-bluegray/10 text-bluegray' },
}

export default function TypeTag({ type, className }: { type: KnowledgeType; className?: string }) {
  const c = config[type]
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', c.className, className)}
    >
      <span aria-hidden>{c.icon}</span>
      {knowledgeTypeLabel[type]}
    </span>
  )
}
