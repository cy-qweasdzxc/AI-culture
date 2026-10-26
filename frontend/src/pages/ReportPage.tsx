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
  scene: '剧情',
}

export default function ReportPage() {
  const s = useJourney()
  const role = s.roles.find((item) => item.id === s.roleId)
  const ending = s.ending

  if (s.state === 'CREATED') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:py-24">
        <p className="mb-4 text-sm font-medium text-inkgreen">体验报告</p>
        <h1 className="font-serif text-3xl font-bold text-ink">暂无数据</h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-bluegray">
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
      <div className="mx-auto max-w-3xl px-4 py-16 sm:py-24">
        <h1 className="font-serif text-3xl font-bold text-ink">体验报告</h1>
        <p role="status" className="mt-5 text-sm leading-7 text-bluegray">
          报告暂未同步，请刷新旅程。
        </p>
        <Link to="/map" className="btn-secondary mt-6">
          返回路线地图
        </Link>
      </div>
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
  const requiredTaskCount = report.requiredTaskCount ?? s.tasks.filter((task) => !task.optional).length
  const optionalTaskCount = report.optionalTaskCount ?? s.tasks.filter((task) => task.optional).length
  const completedRequiredTaskCount =
    report.completedRequiredTaskCount ??
    s.tasks.filter((task) => !task.optional && s.taskStates[task.id]?.status === 'completed').length
  const completedOptionalTaskCount =
    report.completedOptionalTaskCount ??
    s.tasks.filter((task) => task.optional && s.taskStates[task.id]?.status === 'completed').length
  const remainingRequired = Math.max(0, requiredTaskCount - completedRequiredTaskCount)
  const remainingOptional = Math.max(0, optionalTaskCount - completedOptionalTaskCount)
  if (!s.endingId && remainingRequired > 0) {
    suggestions.push(`还有 ${remainingRequired} 道主线任务未完成，继续沿路线探索。`)
  }
  if (!s.endingId && remainingOptional > 0) {
    suggestions.push(`还有 ${remainingOptional} 道自选挑战可尝试，完成后可累积更多知识分。`)
  }
  if (report.totalCodexCount > report.unlockedCodexCount) {
    suggestions.push(
      `图鉴还有 ${report.totalCodexCount - report.unlockedCodexCount} 条未解锁，继续完成任务。`,
    )
  }
  if (s.endingId === 'wei-jin') {
    suggestions.push('你抵达的是「未尽之约」结局。可重置旅程再次出发，体验尚未完成的主线与挑战。')
  }
  if (remainingRequired === 0 && !s.endingId) {
    suggestions.push(
      remainingOptional > 0
        ? '主线任务已完成，可前往苏州博物馆进入尾声，也可以先继续自选挑战。'
        : '主线任务已完成，前往苏州博物馆进入尾声，做出你的最终选择。',
    )
  }
  if (suggestions.length === 0) {
    suggestions.push('这条路线你已经走完了。可以换一位角色重新出发：不同的身份会听到不同的话。')
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-7 sm:px-6 lg:py-10">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-line pb-7 sm:pb-9">
        <div>
          <h1 className="font-serif text-3xl font-bold text-ink sm:text-4xl">体验报告</h1>
          <p className="mt-3 max-w-prose text-sm leading-7 text-bluegray">
            由本次旅程的真实状态计算生成{role ? ` · ${role.name}（${role.identity}）` : ''}
          </p>
        </div>
        {ending ? (
          <span className="chip border-inkgreen/20 bg-inkgreen/5 text-inkgreen">
            结局：{ending.name}
          </span>
        ) : (
          <span className="chip text-bluegray">旅程进行中</span>
        )}
      </header>

      {/* 总览 */}
      <section
        className="mt-7 rounded-xl border border-line bg-surface p-5 sm:p-7"
        aria-labelledby="report-overview-title"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="report-overview-title" className="text-lg font-semibold text-ink">
            旅程总览
          </h2>
          <p className="text-xs tabular-nums text-bluegray">本次体验约 {minutes} 分钟</p>
        </div>
        <div className="mt-6 grid gap-x-10 gap-y-5 sm:grid-cols-2">
          <ProgressBar
            value={doneSpots}
            max={report.totalSpotCount}
            label={`点位 ${doneSpots}/${report.totalSpotCount}`}
          />
          <ProgressBar
            value={doneTasks}
            max={report.totalTaskCount}
            label={`全部任务 ${doneTasks}/${report.totalTaskCount}`}
          />
          <ProgressBar
            value={completedRequiredTaskCount}
            max={requiredTaskCount}
            label={`主线任务 ${completedRequiredTaskCount}/${requiredTaskCount}`}
          />
          <ProgressBar
            value={completedOptionalTaskCount}
            max={optionalTaskCount}
            label={`自选挑战 ${completedOptionalTaskCount}/${optionalTaskCount}`}
          />
          <ProgressBar value={score} max={maxScore} label={`知识分 ${score}/${maxScore}`} />
          <ProgressBar
            value={report.unlockedCodexCount}
            max={report.totalCodexCount}
            label={`图鉴 ${report.unlockedCodexCount}/${report.totalCodexCount}`}
          />
        </div>
      </section>

      <div className="mt-9 grid gap-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12">
        {/* 知识得分与图鉴 */}
        <section>
          <h2 className="text-xl font-semibold text-ink">文化学习</h2>
          <p className="mt-4 text-sm leading-7 text-ink-soft">
            知识得分 <strong className="font-semibold tabular-nums text-ink">{score}</strong> /{' '}
            {maxScore} 分 · 用时约 {minutes} 分钟
          </p>
          <h3 className="mt-5 border-t border-line pt-5 text-sm font-medium leading-6 text-ink">
            知识条目的内容分类分布（分类不代表人工核验）
          </h3>
          {unlocked.length === 0 ? (
            <p className="mt-3 text-sm leading-7 text-bluegray">
              尚未解锁条目。完成路线任务后，文化知识会收录在这里。
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {(['fact', 'disputed', 'legend', 'fiction'] as const).map((t) =>
                typeCounts[t] ? (
                  <li key={t} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <TypeTag type={t} />
                    <span className="tabular-nums text-ink-soft">{typeCounts[t]} 条</span>
                  </li>
                ) : null,
              )}
            </ul>
          )}
        </section>

        {/* 学习建议 */}
        <section className="border-t border-line pt-6 lg:border-t-0 lg:pt-0">
          <h2 className="text-xl font-semibold text-ink">下一步建议</h2>
          <ul className="mt-4 space-y-4">
            {suggestions.map((g, i) => (
              <li key={i} className="flex gap-3 text-sm leading-7 text-ink-soft">
                <span
                  className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-inkgreen"
                  aria-hidden
                />
                {g}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/map" className="btn-secondary">
              回到路线
            </Link>
            <Link to="/codex" className="btn-ghost">
              翻看文化图鉴
            </Link>
          </div>
        </section>
      </div>

      {/* 时间线 */}
      <section className="mt-9 border-t border-line pt-7 sm:mt-12">
        <h2 className="text-xl font-semibold text-ink">旅程时间线</h2>
        {report.events.length === 0 ? (
          <p className="mt-4 text-sm leading-7 text-bluegray">
            暂无记录。抵达点位、完成任务和获得线索后，会在这里留下记录。
          </p>
        ) : (
          <ol className="mt-5 divide-y divide-line">
            {report.events.map((e, i) => (
              <li
                key={i}
                className="grid grid-cols-[3rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 py-4 text-sm sm:grid-cols-[3rem_minmax(0,1fr)_3rem] sm:gap-x-5"
              >
                <span className="text-xs font-medium text-bluegray">{kindLabel[e.kind]}</span>
                <span className="min-w-0 break-words leading-7 text-ink-soft">{e.text}</span>
                <time className="col-start-2 text-xs tabular-nums text-bluegray sm:col-start-auto sm:text-right">
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

      <p className="mt-6 border-t border-line pt-5 text-xs leading-6 text-bluegray">
        说明：本报告来自服务端保存的本次匿名旅程，知识分表示剧情任务得分，不代表经过验证的学习效果。
      </p>
    </div>
  )
}
