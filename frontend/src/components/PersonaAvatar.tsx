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
  xl: 'h-24 w-24 text-2xl',
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
 * 人物头像：优先显示生成式人物图，加载失败时回退到专属方印。
 * 不以颜色作为唯一标识——人物图、姓名用字与颜色共同构成识别。
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
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-[10px] border font-serif font-bold leading-none',
        SIZE[size],
        solid
          ? 'border-cinnabar bg-cinnabar text-white shadow-[0_3px_10px_color-mix(in_oklch,var(--cinnabar)_18%,transparent)]'
          : cn(
              TONE[visual.tone],
              'shadow-[0_3px_12px_color-mix(in_oklch,var(--ink)_12%,transparent)]',
            ),
        className,
      )}
    >
      <span>{visual.char}</span>
      {visual.avatarSrc ? (
        <img
          src={visual.avatarSrc}
          alt=""
          className="absolute inset-0 h-full w-full object-cover outline outline-1 -outline-offset-1 outline-black/10"
          loading={size === 'sm' || size === 'md' ? 'lazy' : 'eager'}
          onError={(event) => {
            event.currentTarget.hidden = true
          }}
        />
      ) : null}
    </span>
  )
}
