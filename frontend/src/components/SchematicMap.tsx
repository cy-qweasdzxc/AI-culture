import type { Spot, SpotStatus } from '@/types'

const NODE_POS = [
  { x: 100, y: 420 }, { x: 460, y: 330 }, { x: 300, y: 230 },
  { x: 210, y: 120 }, { x: 430, y: 70 },
]
const statuses: Record<SpotStatus, { label: string; circle: string }> = {
  undiscovered: { label: '未发现', circle: 'border-bluegray bg-paper-deep text-bluegray' },
  discovered: { label: '已发现', circle: 'border-bronze bg-surface text-bronze' },
  current: { label: '当前点位', circle: 'border-cinnabar bg-cinnabar text-white' },
  completed: { label: '已完成', circle: 'border-inkgreen bg-inkgreen text-white' },
}
interface Props {
  spots: Spot[]
  spotStatus: Record<string, SpotStatus>
  reason?: string
  onSpotClick?: (spotId: string) => void
}

/** Schematic positions express story order, never real distances or walking times. */
export default function SchematicMap({ spots, spotStatus, reason, onSpotClick }: Props) {
  const positions = spots.map((spot, index) => NODE_POS[spot.order - 1] ?? NODE_POS[index % NODE_POS.length])
  const path = positions.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
  return <div className="flex h-full flex-col">
    {reason && <p className="shrink-0 border-b border-line bg-paper-deep px-3 py-1.5 text-xs text-bluegray">
      当前显示路线示意图，点击点位或下方列表继续探索。
    </p>}
    <div className="relative min-h-0 w-full flex-1" role="group" aria-label="文化路线示意图">
      <svg viewBox="0 0 560 500" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <path d="M 40 460 C 120 380, 90 300, 160 240 S 260 140, 250 60" fill="none" stroke="var(--bluegray)" strokeWidth="22" strokeLinecap="round" opacity="0.15" />
        <path d={path} fill="none" stroke="var(--cinnabar)" strokeWidth="2.5" strokeDasharray="6 8" strokeLinecap="round" />
      </svg>
      {spots.map((spot, index) => {
        const status = spotStatus[spot.id] ?? 'undiscovered'
        const state = statuses[status]
        const point = positions[index]
        return <button key={spot.id} type="button" disabled={status === 'undiscovered'}
          aria-label={`${spot.name}：${state.label}`} onClick={() => onSpotClick?.(spot.id)}
          className="absolute flex min-h-11 w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-md px-1 py-1 text-center disabled:cursor-default"
          style={{ left: `${point.x / 560 * 100}%`, top: `${point.y / 500 * 100}%` }}>
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${state.circle}`}>
            {status === 'completed' ? '✓' : status === 'undiscovered' ? '?' : spot.order}
          </span>
          <span className="mt-1 max-w-full rounded bg-surface/95 px-1 text-xs font-semibold leading-4 text-ink">{spot.name}</span>
          <span className="rounded bg-surface/95 px-1 text-[10px] leading-4 text-bluegray">{state.label}</span>
        </button>
      })}
    </div>
  </div>
}
