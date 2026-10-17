import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import DemoDataNotice from '@/components/DemoDataNotice'
import { useJourney } from '@/engine/journeyStore'
import { cn } from '@/utils/cn'

export default function TaskPage() {
  const { taskId } = useParams<{ taskId: string }>()
  const tasks = useJourney((s) => s.tasks)
  const clues = useJourney((s) => s.clues)
  const spots = useJourney((s) => s.spots)
  const busy = useJourney((s) => s.busy)
  const task = tasks.find((item) => item.id === taskId)

  const taskStates = useJourney((s) => s.taskStates)
  const inventory = useJourney((s) => s.inventory)
  const verifyTask = useJourney((s) => s.verifyTask)

  const [selected, setSelected] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [order, setOrder] = useState<number[]>(task?.sortingItems?.map((_, i) => i) ?? [])
  const [result, setResult] = useState<{ ok: boolean; feedback: string } | null>(null)
  const sortingItemsSignature = JSON.stringify(task?.sortingItems ?? [])
  useEffect(() => {
    setSelected(null)
    setPassword('')
    setResult(null)
    const items: string[] = JSON.parse(sortingItemsSignature)
    setOrder(items.map((_, i) => i))
  }, [taskId, sortingItemsSignature])

  if (!task) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="font-serif text-2xl font-bold text-ink">任务不存在</h1>
        <Link to="/map" className="mt-4 inline-block text-cinnabar underline">
          返回路线地图
        </Link>
      </div>
    )
  }

  const spot = spots.find((item) => item.id === task.spotId)
  const st = taskStates[task.id]
  const done = st?.status === 'completed'

  const submit = async () => {
    let answer: unknown = selected
    if (task.type === 'password') answer = password
    if (task.type === 'sorting') answer = order
    try {
      setResult(await verifyTask(task.id, answer))
    } catch (error) {
      setResult({
        ok: false,
        feedback: error instanceof Error ? error.message : '提交失败，请重试。',
      })
    }
  }

  const move = (index: number, dir: -1 | 1) => {
    const next = [...order]
    const j = index + dir
    if (j < 0 || j >= next.length) return
    ;[next[index], next[j]] = [next[j], next[index]]
    setOrder(next)
  }

  const canSubmit =
    !done &&
    !busy &&
    ((task.type === 'password' && password.trim().length > 0) ||
      (task.type === 'sorting' && order.length > 0) ||
      ((task.type === 'quiz' || task.type === 'combine') && selected !== null))

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-10">
      <nav
        className="flex flex-wrap items-center gap-x-2 text-xs leading-6 text-bluegray"
        aria-label="面包屑"
      >
        <Link to="/map" className="inline-flex min-h-11 items-center hover:text-cinnabar">
          路线地图
        </Link>
        <span aria-hidden>/</span>
        <Link
          to={`/spot/${task.spotId}`}
          className="inline-flex min-h-11 items-center hover:text-cinnabar"
        >
          {spot?.name}
        </Link>
        <span aria-hidden>/</span>
        <span>{task.title}</span>
      </nav>

      <header className="mt-4 border-b border-line pb-7 sm:mt-6 sm:pb-9">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="chip text-bluegray">
            {
              {
                quiz: '问答',
                password: '密码',
                sorting: '排序',
                combine: '线索组合',
                observation: '观察',
              }[task.type]
            }
          </span>
          <span className="text-xs font-medium tabular-nums text-bluegray">
            完成可得 {task.knowledgeScore} 分
          </span>
        </div>
        <h1 className="font-serif text-3xl font-bold leading-snug text-ink sm:text-4xl">
          {task.title}
        </h1>
        <p
          className="mt-4 max-w-prose text-base leading-8 text-ink-soft"
          style={{ textWrap: 'pretty' }}
        >
          {task.briefing}
        </p>
      </header>

      {/* 前置线索状态（密码 / 线索组合类） */}
      <div className="mt-5">
        <DemoDataNotice />
      </div>
      {task.requiredClues?.length ? (
        <div className="mt-6 border-b border-line pb-6">
          <h2 className="text-sm font-semibold text-ink">所需线索</h2>
          <ul className="mt-3 flex flex-wrap gap-x-7 gap-y-3">
            {task.requiredClues.map((cid) => {
              const has = inventory.includes(cid)
              return (
                <li key={cid} className="flex items-center gap-2.5 text-sm">
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs',
                      has ? 'bg-inkgreen/10 text-inkgreen' : 'bg-paper-deep text-bluegray',
                    )}
                  >
                    {has ? '✓' : '？'}
                  </span>
                  <span className={has ? 'text-ink' : 'text-bluegray'}>
                    {has ? (clues.find((item) => item.id === cid)?.name ?? cid) : '尚未获得的线索'}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {/* 交互区 */}
      <div className="mt-7 overflow-hidden rounded-xl border border-line bg-surface p-4 sm:p-7 lg:p-8">
        {done ? (
          <div role="status">
            <span className="chip border-inkgreen/20 bg-inkgreen/5 text-inkgreen">已完成</span>
            <p className="mt-4 text-lg font-semibold text-inkgreen">
              任务已完成（{st?.score} 分，尝试 {st?.attempts} 次）
            </p>
            <p className="mt-4 max-w-prose text-sm leading-8 text-ink-soft">{task.explanation}</p>
            {!result?.ok ? (
              <Link to={`/spot/${task.spotId}`} className="btn-secondary mt-6">
                返回点位
              </Link>
            ) : null}
          </div>
        ) : (
          <>
            {(task.type === 'quiz' || task.type === 'combine') && task.options ? (
              <div className="space-y-3" role="radiogroup" aria-label="选项">
                {task.options.map((o) => (
                  <label
                    key={o.key}
                    className={cn(
                      'flex min-h-16 cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-cinnabar',
                      selected === o.key
                        ? 'border-inkgreen bg-inkgreen/5'
                        : 'border-line hover:border-inkgreen hover:bg-paper-deep',
                    )}
                  >
                    <input
                      type="radio"
                      name="answer"
                      className="mt-1 h-4 w-4 shrink-0 accent-inkgreen"
                      checked={selected === o.key}
                      onChange={() => setSelected(o.key)}
                    />
                    <span className="text-sm leading-7 text-ink">
                      <strong className="mr-1.5">{o.key}.</strong>
                      {o.text}
                    </span>
                  </label>
                ))}
              </div>
            ) : null}

            {task.type === 'password' ? (
              <div>
                <label htmlFor="password-input" className="block text-sm font-semibold text-ink">
                  输入口令
                  {task.passwordHint ? (
                    <span className="mt-2 block text-xs font-normal leading-6 text-bluegray">
                      （{task.passwordHint}）
                    </span>
                  ) : null}
                </label>
                <input
                  id="password-input"
                  className="input mt-3 max-w-xl"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && canSubmit && submit()}
                  placeholder="在这里输入"
                  autoComplete="off"
                />
              </div>
            ) : null}

            {task.type === 'sorting' && task.sortingItems ? (
              <ol className="divide-y divide-line" aria-label="排序列表，使用上下按钮调整顺序">
                {order.map((itemIdx, pos) => (
                  <li key={itemIdx} className="flex items-center gap-3 py-4 first:pt-0 last:pb-0">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-paper-deep text-sm font-semibold tabular-nums text-ink-soft">
                      {pos + 1}
                    </span>
                    <span className="min-w-0 flex-1 text-sm leading-7 text-ink">
                      {task.sortingItems?.[itemIdx]}
                    </span>
                    <span className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        className="btn-ghost min-h-11 min-w-11 px-2 text-lg"
                        onClick={() => move(pos, -1)}
                        disabled={pos === 0}
                        aria-label={`上移第 ${pos + 1} 项`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn-ghost min-h-11 min-w-11 px-2 text-lg"
                        onClick={() => move(pos, 1)}
                        disabled={pos === order.length - 1}
                        aria-label={`下移第 ${pos + 1} 项`}
                      >
                        ↓
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}

            {result && !result.ok ? (
              <p
                className="mt-5 rounded-lg bg-warning/10 px-4 py-3 text-sm leading-7 text-ink"
                role="alert"
              >
                {result.feedback}
              </p>
            ) : null}

            <div className="mt-7 flex flex-wrap items-center gap-4 border-t border-line pt-6">
              <button type="button" className="btn-primary" disabled={!canSubmit} onClick={submit}>
                提交答案
              </button>
              <span className="text-xs text-bluegray">已尝试 {st?.attempts ?? 0} 次</span>
            </div>
          </>
        )}
      </div>

      {result?.ok ? (
        <div className="anim-fade-rise mt-5 rounded-xl bg-inkgreen/5 p-5 sm:p-7" role="status">
          <p className="font-medium leading-7 text-inkgreen">{result.feedback}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link to={`/spot/${task.spotId}`} className="btn-primary">
              返回点位
            </Link>
            <Link to="/codex" className="btn-secondary">
              查看文化图鉴
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}
