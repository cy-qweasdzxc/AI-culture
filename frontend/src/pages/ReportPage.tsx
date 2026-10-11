import { Link } from 'react-router-dom'
import ProgressBar from '@/components/ProgressBar'
import TypeTag from '@/components/TypeTag'
import { useJourney } from '@/engine/journeyStore'

const kindLabel: Record<string, string> = {
  journey: '旅程',
  spot: '点位',
  task: '任务',
  clue: '线索',
  codex: '图鉴',
  choice: '选择',
  ending: '结局',
  mode: '模式',
}

export default function ReportPage() {
  const s = useJourney()
  const role = s.roles.find((item) => item.id === s.roleId)
  const ending = s.ending

  if (s.state === 'CREATED') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="font-serif text-2xl font-bold text-ink">暂无数据</h1>
        <p className="mt-3 text-sm text-bluegray">
          开始一段旅程后，这里会生成由真实旅程状态计算的体验报告。
        </p>
        <Link to="/role" className="btn-primary mt-6 inline-flex">
          去选择角色
        </Link>
      </div>
    )
  }

  if (!s.report)
    return (
      <p role="status" className="mx-auto max-w-3xl px-4 py-16 text-sm text-bluegray">
        报告暂未同步，请刷新旅程。
      </p>
    )
  const report = s.report
  const doneTasks = report.completedTaskCount
  const doneSpots = report.completedSpotCount
  const score = report.knowledgeScore
  const maxScore = report.maxScore
  const unlocked = s.codexEntries
  const typeCounts = unlocked.reduce<Record<string, number>>((acc, e) => {
    acc[e.type] = (acc[e.type] ?? 0) + 1
    return acc
  }, {})
  const minutes = report.durationMinutes

  const suggestions: string[] = []
  const undoneCount = report.totalTaskCount - doneTasks
  if (undoneCount > 0) {
    suggestions.push(`还有 ${undoneCount} 个任务未完成，继续沿路线探索。`)
  }
  if (report.totalCodexCount > report.unlockedCodexCount) {
    suggestions.push(
      `图鉴还有 ${report.totalCodexCount - report.unlockedCodexCount} 条未解锁，继续完成任务。`,
    )
  }
  if (s.endingId === 'wei-jin') {
    suggestions.push('你抵达的是「未尽之约」结局。可重置旅程再次出发，尝试完成全部任务。')
  }
  if (undoneCount === 0 && !s.endingId) {
    suggestions.push('任务已全部完成，前往苏州博物馆进入尾声，做出你的最终选择。')
  }
  if (suggestions.length === 0) {
    suggestions.push('这条路线你已经走完了。可以换一位角色重新出发：不同的身份会听到不同的话。')
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink">体验报告</h1>
          <p className="mt-2 text-sm text-bluegray">
            由本次旅程的真实状态计算生成{role ? ` · ${role.name}（${role.identity}）` : ''}
          </p>
        </div>
        {ending ? (
          <span className="chip border-cinnabar bg-cinnabar text-white">结局：{ending.name}</span>
        ) : (
          <span className="chip text-bluegray">旅程进行中</span>
        )}
      </div>

      {/* 总览 */}
      <div className="card mt-6 grid gap-6 p-6 sm:grid-cols-2">
        <ProgressBar
          value={doneSpots}
          max={report.totalSpotCount}
          label={`点位 ${doneSpots}/${report.totalSpotCount}`}
        />
        <ProgressBar
          value={doneTasks}
          max={report.totalTaskCount}
          label={`任务 ${doneTasks}/${report.totalTaskCount}`}
        />
        <ProgressBar value={score} max={maxScore} label={`知识分 ${score}/${maxScore}`} />
        <ProgressBar
          value={report.unlockedCodexCount}
          max={report.totalCodexCount}
          label={`图鉴 ${report.unlockedCodexCount}/${report.totalCodexCount}`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* 知识得分与图鉴 */}
        <section className="card p-6">
          <h2 className="font-serif text-lg font-bold text-inkgreen">文化学习</h2>
          <p className="mt-3 text-sm text-ink-soft">
            知识得分 <strong className="font-serif text-xl text-ink">{score}</strong> / {maxScore}{' '}
            分 · 用时约 {minutes} 分钟
          </p>
          <h3 className="mt-5 text-xs font-medium text-ink">演示条目的内容分类分布（待审核）</h3>
          {unlocked.length === 0 ? (
            <p className="mt-2 text-sm text-bluegray">尚未解锁条目。</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {(['fact', 'disputed', 'legend', 'fiction'] as const).map((t) =>
                typeCounts[t] ? (
                  <li key={t} className="flex items-center justify-between text-sm">
                    <TypeTag type={t} />
                    <span className="tabular-nums text-ink-soft">{typeCounts[t]} 条</span>
                  </li>
                ) : null,
              )}
            </ul>
          )}
        </section>

        {/* 学习建议 */}
        <section className="card p-6">
          <h2 className="font-serif text-lg font-bold text-inkgreen">下一步建议</h2>
          <ul className="mt-3 space-y-3">
            {suggestions.map((g, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-ink-soft">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cinnabar"
                  aria-hidden
                />
                {g}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* 时间线 */}
      <section className="card mt-6 p-6">
        <h2 className="font-serif text-lg font-bold text-inkgreen">旅程时间线</h2>
        {report.events.length === 0 ? (
          <p className="mt-3 text-sm text-bluegray">暂无记录。</p>
        ) : (
          <ol className="mt-4 space-y-2.5">
            {report.events.map((e, i) => (
              <li key={i} className="flex items-baseline gap-3 text-sm">
                <span className="chip w-14 shrink-0 justify-center text-bluegray">
                  {kindLabel[e.kind]}
                </span>
                <span className="flex-1 text-ink-soft">{e.text}</span>
                <time className="shrink-0 text-xs tabular-nums text-bluegray">
                  {new Date(e.at).toLocaleTimeString('zh-CN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="mt-4 text-xs text-bluegray">
        说明：本报告来自服务端保存的本次匿名旅程，知识分表示剧情任务得分，不代表经过验证的学习效果。
      </p>
    </div>
  )
}
