import { personaVisual, type PersonaTone } from '@/data/personas'
import { cn } from '@/utils/cn'

/** 色调 → Tailwind 类（静态字符串，便于 Tailwind 扫描生成）。 */
const TONE: Record<PersonaTone, string> = {
  cinnabar: 'border-cinnabar/45 bg-cinnabar/10 text-cinnabar',
  inkgreen: 'border-inkgreen/45 bg-inkgreen/10 text-inkgreen',
  bronze: 'border-bronze/55 bg-bronze/12 text-bronze',
  bluegray: 'border-bluegray/45 bg-bluegray/10 text-bluegray',
  ink: 'border-ink/35 bg-ink/[0.06] text-ink',
}

const SIZE = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
} as const

interface PersonaAvatarProps {
  id: string | null | undefined
  name: string
  /** user 渲染为朱砂实心印（与玩家气泡同色）；npc 渲染为描边印。 */
  kind?: 'npc' | 'user'
  size?: keyof typeof SIZE
  className?: string
}

/**
 * 印章式头像：方印 + 人物用字 + 内圈细边。
 * 不以颜色作为唯一标识——每个人物用字不同，颜色只做辅助。
 */
export default function PersonaAvatar({
  id,
  name,
  kind = 'npc',
  size = 'md',
  className,
}: PersonaAvatarProps) {
  const visual = personaVisual(id, name)
  const solid = kind === 'user'
  return (
    <span
      aria-hidden
      title={name}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-[6px] border font-serif font-bold leading-none',
        SIZE[size],
        solid
          ? 'border-cinnabar bg-cinnabar text-white shadow-sm'
          : cn(
              TONE[visual.tone],
              'shadow-[inset_0_0_0_1px_color-mix(in_oklch,currentColor_20%,transparent)]',
            ),
        className,
      )}
    >
      {visual.char}
    </span>
  )
}
