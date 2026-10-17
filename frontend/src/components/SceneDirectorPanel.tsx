import { Link } from 'react-router-dom'
import type { Npc, SceneDirection } from '@/types'

interface SceneDirectorPanelProps {
  direction: SceneDirection | null
  npcs: Npc[]
  running: boolean
  onContinue: () => void
}

const PACE = { explore: '展开探索', focus: '聚焦线索', transition: '转入下一幕' }

export default function SceneDirectorPanel({
  direction,
  npcs,
  running,
  onContinue,
}: SceneDirectorPanelProps) {
  const next = direction?.nextAction
  const nextRoute = next
    ? next.type === 'task' && next.targetId
      ? `/task/${encodeURIComponent(next.targetId)}`
      : next.type === 'finale'
        ? `/spot/${encodeURIComponent(next.targetId || 'subo')}`
        : next.type === 'map'
          ? '/map'
          : null
    : null

  return (
    <section aria-label="导演调度" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">导演 Agent</h2>
        <span className="text-xs text-bluegray">
          {direction ? (direction.mode === 'model' ? '模型调度' : '规则调度') : '等待开场'}
        </span>
      </div>
      {direction ? (
        <>
          <div>
            <p className="text-xs text-bluegray">当前节拍 · {PACE[direction.pace]}</p>
            <p className="mt-2 break-words text-base font-medium leading-7 text-ink">
              {direction.beat}
            </p>
            <p className="mt-2 break-words text-sm leading-7 text-ink-soft">
              {direction.objective}
            </p>
          </div>
          <div>
            <h3 className="text-xs font-medium text-bluegray">本轮发言顺序</h3>
            <ol className="mt-2 space-y-2">
              {direction.speakerOrder.map((id, index) => (
                <li key={`${id}-${index}`} className="flex items-center gap-2 text-sm text-ink">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-paper-deep text-xs tabular-nums text-inkgreen">
                    {index + 1}
                  </span>
                  {npcs.find((item) => item.id === id)?.name ?? id}
                </li>
              ))}
            </ol>
          </div>
          <div className="border-t border-line pt-4">
            <h3 className="text-xs font-medium text-bluegray">调度理由</h3>
            <p className="mt-2 break-words text-sm leading-7 text-ink-soft">{direction.reason}</p>
          </div>
          <div className="border-t border-line pt-4">
            <h3 className="text-xs font-medium text-bluegray">下一步</h3>
            <p className="mt-2 text-sm leading-7 text-ink">{next?.label}</p>
            {nextRoute && running ? (
              <>
                <button type="button" disabled className="btn-secondary mt-3 w-full text-sm">
                  {next?.label}
                </button>
                <p className="mt-2 text-xs leading-6 text-bluegray">本轮保存后可前往下一步。</p>
              </>
            ) : nextRoute ? (
              <Link to={nextRoute} className="btn-secondary mt-3 w-full text-sm">
                {next?.label}
              </Link>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-sm leading-7 text-ink-soft">
          提问后，导演会根据话题和旅程进度选择发言角色，旁白负责串联场景。
        </p>
      )}
      <button
        type="button"
        onClick={onContinue}
        disabled={running}
        className="btn-secondary w-full text-sm"
      >
        继续剧情
      </button>
      <p className="text-xs leading-6 text-bluegray">剧情引导不会替你完成任务或决定结局。</p>
    </section>
  )
}
