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
  useEffect(() => {
    setSelected(null)
    setPassword('')
    setResult(null)
    setOrder(task?.sortingItems?.map((_, i) => i) ?? [])
  }, [taskId, task?.sortingItems])

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
    <div className="mx-auto max-w-3xl px-4 py-8">
      <nav className="text-xs text-bluegray" aria-label="面包屑">
        <Link to="/map" className="hover:text-cinnabar">
          路线地图
        </Link>
        <span className="mx-1">/</span>
        <Link to={`/spot/${task.spotId}`} className="hover:text-cinnabar">
          {spot?.name}
        </Link>
        <span className="mx-1">/</span>
        <span>{task.title}</span>
      </nav>

      <header className="mt-4">
        <div className="flex items-center gap-3">
          <h1 className="font-serif text-2xl font-bold text-ink">{task.title}</h1>
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
          <span className="chip bg-bronze/10 text-bronze">{task.knowledgeScore} 分</span>
        </div>
        <p
          className="mt-3 max-w-prose text-sm leading-relaxed text-ink-soft"
          style={{ textWrap: 'pretty' }}
        >
          {task.briefing}
        </p>
      </header>

      {/* 前置线索状态（密码 / 线索组合类） */}
      <div className="mt-4">
        <DemoDataNotice />
      </div>
      {task.requiredClues?.length ? (
        <div className="mt-5 rounded-md border border-line bg-paper-deep p-4">
          <h2 className="text-xs font-medium text-ink">所需线索</h2>
          <ul className="mt-2 space-y-1">
            {task.requiredClues.map((cid) => {
              const has = inventory.includes(cid)
              return (
                <li key={cid} className="flex items-center gap-2 text-sm">
                  <span aria-hidden className={has ? 'text-inkgreen' : 'text-bluegray'}>
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
      <div className="card mt-6 p-6">
        {done ? (
          <div className="rounded-md bg-inkgreen/10 p-4" role="status">
            <p className="font-medium text-inkgreen">
              任务已完成（{st?.score} 分，尝试 {st?.attempts} 次）
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">{task.explanation}</p>
          </div>
        ) : (
          <>
            {(task.type === 'quiz' || task.type === 'combine') && task.options ? (
              <div className="space-y-2" role="radiogroup" aria-label="选项">
                {task.options.map((o) => (
                  <label
                    key={o.key}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-md border p-3.5 transition-colors',
                      selected === o.key
                        ? 'border-cinnabar ring-2 ring-cinnabar/20'
                        : 'border-line hover:border-bronze',
                    )}
                  >
                    <input
                      type="radio"
                      name="answer"
                      className="mt-0.5"
                      checked={selected === o.key}
                      onChange={() => setSelected(o.key)}
                    />
                    <span className="text-sm text-ink">
                      <strong className="mr-1.5">{o.key}.</strong>
                      {o.text}
                    </span>
                  </label>
                ))}
              </div>
            ) : null}

            {task.type === 'password' ? (
              <div>
                <label htmlFor="password-input" className="text-sm font-medium text-ink">
                  输入口令
                  {task.passwordHint ? (
                    <span className="ml-2 text-xs font-normal text-bluegray">
                      （{task.passwordHint}）
                    </span>
                  ) : null}
                </label>
                <input
                  id="password-input"
                  className="input mt-2"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && canSubmit && submit()}
                  placeholder="在这里输入"
                  autoComplete="off"
                />
              </div>
            ) : null}

            {task.type === 'sorting' && task.sortingItems ? (
              <ol className="space-y-2" aria-label="排序列表，使用上下按钮调整顺序">
                {order.map((itemIdx, pos) => (
                  <li
                    key={itemIdx}
                    className="flex items-center gap-2 rounded-md border border-line p-3"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-paper-deep font-serif text-sm font-bold text-cinnabar">
                      {pos + 1}
                    </span>
                    <span className="flex-1 text-sm text-ink">{task.sortingItems?.[itemIdx]}</span>
                    <span className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        className="btn-ghost min-h-9 px-2"
                        onClick={() => move(pos, -1)}
                        disabled={pos === 0}
                        aria-label={`上移第 ${pos + 1} 项`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn-ghost min-h-9 px-2"
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
                className="mt-4 rounded-md bg-warning/10 px-3 py-2 text-sm leading-relaxed text-ink"
                role="alert"
              >
                {result.feedback}
              </p>
            ) : null}

            <div className="mt-5 flex items-center gap-3">
              <button type="button" className="btn-primary" disabled={!canSubmit} onClick={submit}>
                提交答案
              </button>
              <span className="text-xs text-bluegray">已尝试 {st?.attempts ?? 0} 次</span>
            </div>
          </>
        )}
      </div>

      {result?.ok && !done ? null : null}
      {result?.ok ? (
        <div
          className="card anim-unlock-pop mt-4 border-inkgreen/50 bg-inkgreen/5 p-5"
          role="status"
        >
          <p className="font-medium text-inkgreen">{result.feedback}</p>
          <div className="mt-3 flex flex-wrap gap-3">
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
