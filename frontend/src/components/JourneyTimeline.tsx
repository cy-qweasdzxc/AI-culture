import { useJourney } from '@/engine/journeyStore'
import { journeyProgress } from '@/utils/journeyProgress'

export default function JourneyTimeline() {
  const state = useJourney()
  const progress = journeyProgress(state)
  const steps = <ol className="flex flex-wrap justify-between gap-x-3 gap-y-2 text-xs" aria-label="旅程阶段">
    {progress.steps.map((step, index) => <li key={step.label} aria-current={index === progress.current ? 'step' : undefined} className={index === progress.current ? 'font-semibold text-cinnabar' : step.complete ? 'text-inkgreen' : 'text-bluegray'}>
      <span aria-hidden>{step.complete ? '✓' : index + 1} </span>{step.label}
    </li>)}
  </ol>
  return <section className="border-b border-line bg-paper px-4 py-2" aria-label="旅程进度" data-testid="journey-timeline">
    <div className="page-width">
      <details className="md:hidden">
        <summary className="min-h-10 cursor-pointer text-xs leading-5">
          {progress.steps[progress.current].label} · 任务 {progress.completed}/{progress.total} · 游戏积分 {progress.score}
          <span className="block text-bluegray">下一步：{progress.next} · {progress.percent}%</span>
        </summary>
        <div className="pb-2 pt-3">{steps}</div>
      </details>
      <div className="hidden items-center gap-5 md:flex"><div className="min-w-0 flex-1">{steps}</div><span className="shrink-0 text-xs">游戏积分 {progress.score} · {progress.percent}%</span></div>
    </div>
  </section>
}
