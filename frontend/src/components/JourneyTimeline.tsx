import { useJourney } from '@/engine/journeyStore'
import { journeyProgress } from '@/utils/journeyProgress'

export default function JourneyTimeline() {
  const state = useJourney()
  const progress = journeyProgress(state)
  const steps = <ol className="play-timeline-steps flex flex-wrap justify-between gap-x-3 gap-y-2" aria-label="旅程阶段">
    {progress.steps.map((step, index) => <li key={step.label} aria-current={index === progress.current ? 'step' : undefined} className={index === progress.current ? 'is-current' : step.complete ? 'is-complete' : 'is-upcoming'}>
      <span className="play-timeline-dot" aria-hidden>{step.complete ? '✓' : index + 1}</span><span>{step.label}</span>
    </li>)}
  </ol>
  return <section className="journey-timeline border-b border-line bg-paper px-4 py-4" aria-label="旅程进度" data-testid="journey-timeline">
    <div className="page-width">
      <details className="md:hidden">
        <summary className="min-h-10 cursor-pointer text-xs leading-5">
          <span className="font-semibold">第 {progress.current + 1} 阶段：{progress.steps[progress.current].label}</span>｜任务 {progress.completed}/{progress.total}
          <span className="block text-bluegray">下一步：{progress.next}｜完成度 {progress.percent}%｜游戏积分 {progress.score}</span>
        </summary>
        <div className="pb-2 pt-3">{steps}</div>
      </details>
      <div className="journey-timeline-desktop hidden items-center gap-5 md:flex"><div className="min-w-0 flex-1">{steps}</div><span className="shrink-0 text-sm font-semibold">{progress.percent}%｜游戏积分 {progress.score}</span></div>
    </div>
  </section>
}
