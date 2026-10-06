import { spots } from '@/data/theme'
import type { SpotStatus } from '@/types'
import { cn } from '@/utils/cn'

/**
 * 示意地图（无密钥环境下的完整可用降级方案）：
 * 以写意水巷路线呈现 5 个点位，节点可点击，状态三通道（形状+文字+色彩）。
 */

const NODE_POS = [
  { x: 90, y: 420 },
  { x: 480, y: 330 },
  { x: 300, y: 230 },
  { x: 210, y: 120 },
  { x: 430, y: 60 },
]

const statusStyle: Record<SpotStatus, { ring: string; fill: string; text: string; label: string }> = {
  undiscovered: { ring: 'stroke-[#8b8b8b]', fill: 'fill-[#e5e2da]', text: 'fill-[#6b6b6b]', label: '未发现' },
  discovered: { ring: 'stroke-bronze', fill: 'fill-surface', text: 'fill-bronze', label: '已发现' },
  current: { ring: 'stroke-cinnabar', fill: 'fill-cinnabar', text: 'fill-white', label: '当前点位' },
  completed: { ring: 'stroke-inkgreen', fill: 'fill-inkgreen', text: 'fill-white', label: '已完成' },
}

interface SchematicMapProps {
  spotStatus: Record<string, SpotStatus>
  reason?: string
  onSpotClick?: (spotId: string) => void
}

export default function SchematicMap({ spotStatus, reason, onSpotClick }: SchematicMapProps) {
  const path = NODE_POS.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  return (
    <div className="flex h-full flex-col">
      {reason ? (
        <p className="border-b border-line bg-paper-deep px-3 py-1.5 text-xs text-bluegray">
          在线地图暂不可用（{reason}），已切换为示意路线，功能不受影响。
        </p>
      ) : null}
      <svg viewBox="0 0 560 470" className="h-full w-full" role="img" aria-label="文化路线示意图">
        {/* 水巷 */}
        <path
          d="M 40 460 C 120 380, 90 300, 160 240 S 260 140, 250 60"
          fill="none"
          stroke="oklch(0.75 0.05 230)"
          strokeWidth="22"
          strokeLinecap="round"
          opacity="0.35"
        />
        <path
          d="M 40 460 C 120 380, 90 300, 160 240 S 260 140, 250 60"
          fill="none"
          stroke="oklch(0.65 0.05 230)"
          strokeWidth="2"
          strokeDasharray="1 8"
          strokeLinecap="round"
        />
        {/* 路线 */}
        <path d={path} fill="none" stroke="var(--cinnabar)" strokeWidth="2.5" strokeDasharray="6 8" strokeLinecap="round" className="route-line-draw" style={{ strokeDashoffset: 0 }} />
        {spots.map((s, i) => {
          const st = spotStatus[s.id] ?? 'undiscovered'
          const c = statusStyle[st]
          const p = NODE_POS[i]
          const clickable = st !== 'undiscovered'
          return (
            <g
              key={s.id}
              transform={`translate(${p.x}, ${p.y})`}
              onClick={() => clickable && onSpotClick?.(s.id)}
              className={cn(clickable && 'cursor-pointer')}
              role={clickable ? 'button' : undefined}
              aria-label={`${s.name}：${c.label}`}
            >
              <circle r="20" className={cn(c.fill, c.ring)} strokeWidth="2.5" />
              <text textAnchor="middle" dy="5" fontSize="13" className={c.text} fontWeight="700">
                {st === 'completed' ? '✓' : st === 'undiscovered' ? '?' : s.order}
              </text>
              <text textAnchor="middle" y="38" fontSize="14" className="fill-ink" fontWeight="600">
                {s.shortName}
              </text>
              <text textAnchor="middle" y="54" fontSize="11" className="fill-bluegray">
                {c.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
