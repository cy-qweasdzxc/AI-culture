import { Link, Navigate, useParams } from 'react-router-dom'
import SealMark from '@/components/SealMark'
import { selectKnowledgeScore, selectMaxScore, useJourney } from '@/engine/journeyStore'

export default function EndingPage() {
  const { endingId } = useParams<{ endingId: string }>()
  const completed = useJourney((s) => s.state === 'COMPLETED' && s.endingId === endingId)
  const roleId = useJourney((s) => s.roleId)
  const flags = useJourney((s) => s.flags)
  const events = useJourney((s) => s.events)
  const score = useJourney(selectKnowledgeScore)
  const savedEnding = useJourney((s) => s.ending)
  const roles = useJourney((s) => s.roles)

  const ending = savedEnding?.id === endingId ? savedEnding : undefined
  const role = roles.find((item) => item.id === roleId)

  if (!ending || !completed) {
    return <Navigate to="/map" replace />
  }

  const choiceText =
    flags.finalChoice === 'hang'
      ? '把灯挂上长廊'
      : flags.finalChoice === 'keep'
        ? '把灯收进行囊'
        : '（未选择）'
  const keyEvents = events
    .filter((e) => e.kind === 'task' || e.kind === 'choice' || e.kind === 'ending')
    .slice(-8)

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:py-14">
      <header className="flex items-center justify-between gap-6 border-b border-line pb-7 sm:pb-9">
        <div>
          <p className="text-sm font-medium text-inkgreen">旅程完成 · {ending.category}结局</p>
          <h1
            className="mt-3 font-serif text-4xl font-bold leading-snug text-ink sm:text-5xl"
            style={{ textWrap: 'balance' }}
          >
            {ending.name}
          </h1>
        </div>
        <SealMark
          text={ending.name.slice(0, 2)}
          className="h-14 w-14 shrink-0 text-lg sm:h-16 sm:w-16"
        />
      </header>

      <div className="anim-fade-rise mt-7 rounded-xl bg-surface p-5 sm:mt-9 sm:p-9">
        <p
          className="max-w-prose text-base leading-9 text-ink sm:text-lg sm:leading-10"
          style={{ textWrap: 'pretty' }}
        >
          {role ? `${role.name}，` : ''}
          {ending.narrative}
        </p>
        <p className="mt-7 border-t border-line pt-5 text-xs leading-6 text-bluegray">
          结局印记：{ending.conditionText}。
        </p>
      </div>

      {/* 关键选择回顾 */}
      <section className="mt-9 sm:mt-12">
        <h2 className="text-xl font-semibold text-ink">这一路的回顾</h2>
        <dl className="mt-5 grid gap-6 border-y border-line py-6 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-bluegray">尾声的选择</dt>
            <dd className="mt-2 text-base font-medium text-ink">{choiceText}</dd>
          </div>
          <div>
            <dt className="text-xs text-bluegray">知识得分</dt>
            <dd className="mt-2 text-base font-medium tabular-nums text-ink">
              {score} / {selectMaxScore()} 分
            </dd>
          </div>
        </dl>
        <ol className="mt-6 space-y-4">
          {keyEvents.map((e, i) => (
            <li key={i} className="flex items-start gap-3 text-sm leading-7 text-ink-soft">
              <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-inkgreen" aria-hidden />
              {e.text}
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-9 flex flex-col gap-3 border-t border-line pt-7 sm:mt-12 sm:flex-row">
        <Link to="/report" className="btn-primary">
          查看体验报告
        </Link>
        <Link to="/codex" className="btn-secondary">
          翻看文化图鉴
        </Link>
      </div>
    </div>
  )
}
