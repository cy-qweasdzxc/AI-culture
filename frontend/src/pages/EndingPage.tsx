import { Link, Navigate, useParams } from 'react-router-dom'
import SealMark from '@/components/SealMark'
import { endingById } from '@/data/endings'
import { roleById } from '@/data/roles'
import { selectKnowledgeScore, selectMaxScore, useJourney } from '@/engine/journeyStore'

export default function EndingPage() {
  const { endingId } = useParams<{ endingId: string }>()
  const completed = useJourney((s) => s.state === 'COMPLETED' && s.endingId === endingId)
  const roleId = useJourney((s) => s.roleId)
  const flags = useJourney((s) => s.flags)
  const events = useJourney((s) => s.events)
  const score = useJourney(selectKnowledgeScore)

  const ending = endingId ? endingById.get(endingId) : undefined
  const role = roleId ? roleById.get(roleId) : undefined

  if (!ending || !completed) {
    return <Navigate to="/map" replace />
  }

  const choiceText = flags.finalChoice === 'hang' ? '把灯挂上长廊' : flags.finalChoice === 'keep' ? '把灯收进行囊' : '（未选择）'
  const keyEvents = events.filter((e) => e.kind === 'task' || e.kind === 'choice' || e.kind === 'ending').slice(-8)

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="text-center">
        <SealMark text={ending.name.slice(0, 2)} className="mx-auto h-14 w-14 text-lg" />
        <p className="mt-4 text-sm font-medium text-bronze">{ending.category}结局</p>
        <h1 className="mt-2 font-serif text-4xl font-bold text-ink" style={{ textWrap: 'balance' }}>
          {ending.name}
        </h1>
      </div>

      <div className="card anim-fade-rise mt-8 p-8">
        <p className="max-w-prose text-base leading-loose text-ink" style={{ textWrap: 'pretty' }}>
          {role ? `${role.name}，` : ''}
          {ending.narrative}
        </p>
        <p className="mt-6 border-t border-line pt-4 text-xs text-bluegray">
          结局判定由规则执行：{ending.conditionText}。正式版本中 AI 仅润色叙事文案，判定结果可复现。
        </p>
      </div>

      {/* 关键选择回顾 */}
      <section className="mt-8">
        <h2 className="font-serif text-lg font-bold text-ink">这一路的回顾</h2>
        <dl className="card mt-4 grid gap-4 p-6 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-bluegray">尾声的选择</dt>
            <dd className="mt-1 text-sm font-medium text-ink">{choiceText}</dd>
          </div>
          <div>
            <dt className="text-xs text-bluegray">知识得分</dt>
            <dd className="mt-1 text-sm font-medium text-ink">
              {score} / {selectMaxScore()} 分
            </dd>
          </div>
        </dl>
        <ol className="mt-4 space-y-2">
          {keyEvents.map((e, i) => (
            <li key={i} className="flex items-center gap-3 text-sm text-ink-soft">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-bronze" aria-hidden />
              {e.text}
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-10 flex flex-wrap justify-center gap-3">
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
