import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import PersonaAvatar from '@/components/PersonaAvatar'
import DemoDataNotice from '@/components/DemoDataNotice'
import TypeTag from '@/components/TypeTag'
import SpotMedia from '@/components/SpotMedia'
import AudioGuide from '@/components/AudioGuide'
import { canEnterFinale, useJourney } from '@/engine/journeyStore'
import { cn } from '@/utils/cn'

export default function SpotPage() {
  const { spotId } = useParams<{ spotId: string }>()
  const navigate = useNavigate()
  const spots = useJourney((s) => s.spots)
  const npcs = useJourney((s) => s.npcs)
  const tasks = useJourney((s) => s.tasks)
  const codexEntries = useJourney((s) => s.codexEntries)
  const busy = useJourney((s) => s.busy)
  const audience = useJourney((s) => s.audienceMode)
  const [error, setError] = useState<string | null>(null)
  const spot = spots.find((item) => item.id === spotId)

  const spotStatus = useJourney((s) => s.spotStatus)
  const taskStates = useJourney((s) => s.taskStates)
  const unlockedCodex = useJourney((s) => s.unlockedCodex)
  const enterFinale = useJourney((s) => s.enterFinale)
  const finaleOpen = useJourney(canEnterFinale)
  const endingId = useJourney((s) => s.endingId)
  const routeInfo = useJourney((s) => s.routeInfo)

  const [choice, setChoice] = useState<'hang' | 'keep' | null>(null)

  if (!spot) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <div className="rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <h1 className="font-serif text-3xl font-bold text-ink">点位不存在</h1>
          <p className="mt-3 text-sm text-ink-soft">回到路线地图，选择一个已发现的点位继续探索。</p>
          <Link to="/map" className="btn-primary mt-6">
            返回路线地图
          </Link>
        </div>
      </div>
    )
  }

  const status = spotStatus[spot.id] ?? 'undiscovered'
  const npc = npcs.find((item) => item.id === spot.npcId)
  const arrived = status === 'current' || status === 'completed'
  const isFinaleSpot = spot.id === (routeInfo?.finale_location_id ?? 'subo')
  const finalChoices = routeInfo?.finale_choices ?? [
    { key: 'hang' as const, label: '把灯挂上长廊', detail: '把这一路的故事，讲给更多人听' },
    { key: 'keep' as const, label: '把灯收进行囊', detail: '把故事留给自己，慢慢消化' },
  ]
  const completedTasks = spot.taskIds.filter((id) => taskStates[id]?.status === 'completed').length

  const confirmFinale = async () => {
    if (!choice) return
    try {
      const id = await enterFinale(choice)
      navigate(`/ending/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '结局判定失败。')
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <nav className="flex flex-wrap items-center gap-2 text-sm text-bluegray" aria-label="面包屑">
        <Link to="/map" className="inline-flex min-h-11 items-center gap-2 hover:text-cinnabar">
          <span aria-hidden>←</span>路线地图
        </Link>
        <span aria-hidden>/</span>
        <span aria-current="page">{spot.name}</span>
      </nav>

      <header className="mt-5 grid items-center gap-7 md:grid-cols-[1fr_0.9fr] md:gap-10">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3 text-sm text-bluegray">
            <span>第 {spot.order} 站</span>
            <span
              className={cn(
                'chip',
                status === 'completed'
                  ? 'border-inkgreen/25 bg-inkgreen/5 text-inkgreen'
                  : 'text-ink-soft',
              )}
            >
              {status === 'completed'
                ? '✓ 已完成'
                : arrived
                  ? '● 当前点位'
                  : status === 'discovered'
                    ? '已发现 · 尚未到达'
                    : '未发现'}
            </span>
          </div>
          <h1 className="mt-4 font-serif text-4xl font-bold tracking-tight text-ink">
            {spot.name}
          </h1>
          <p className="mt-3 text-base font-medium leading-7 text-inkgreen">{spot.intro}</p>
          <p
            className="mt-5 max-w-prose text-sm leading-7 text-ink-soft"
            style={{ textWrap: 'pretty' }}
          >
            {spot.story}
          </p>
        </div>
        <div><SpotMedia locationId={spot.id} name={spot.name} /><AudioGuide locationId={spot.id} text={audience === 'child' ? spot.intro : `${spot.intro}\n剧情设定（虚构）：${spot.story}`} audience={audience} /></div>
      </header>

      {!arrived ? (
        <section className="mt-10 rounded-xl border border-line bg-surface p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-ink">到达后，开启这里的故事</h2>
          <p className="mt-3 max-w-prose text-sm leading-6 text-ink-soft">
            {status === 'discovered'
              ? '你已发现这个点位，但还没有到达。到达后才能开启这里的剧情。'
              : '这个点位尚未解锁，先完成前一个点位的任务。'}
          </p>
          <Link to="/map" className="btn-primary mt-5">
            去地图到达
          </Link>
        </section>
      ) : (
        <div className="mt-10">
          <div className="grid items-start gap-8 border-t border-line pt-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
            <section className="order-2 min-w-0 lg:order-1" aria-labelledby="spot-tasks-title">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="spot-tasks-title" className="text-xl font-semibold text-ink">
                  这里的谜题
                </h2>
                <span className="text-sm text-bluegray">
                  已完成 {completedTasks} / {spot.taskIds.length}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-ink-soft">
                观察眼前的景物，也从对话里寻找答案。
              </p>
              <ul className="mt-5 divide-y divide-line border-y border-line">
                {spot.taskIds.map((tid, index) => {
                  const task = tasks.find((item) => item.id === tid)
                  const taskState = taskStates[tid]
                  const done = taskState?.status === 'completed'
                  if (!task) return null
                  return (
                    <li key={tid}>
                      <Link
                        to={`/task/${tid}`}
                        className="group flex min-h-24 items-center gap-4 rounded-md px-2 py-5 transition-colors hover:bg-surface sm:px-3"
                      >
                        <span
                          className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-medium',
                            done
                              ? 'border-inkgreen/25 bg-inkgreen/5 text-inkgreen'
                              : 'border-line bg-surface text-bluegray',
                          )}
                          aria-hidden
                        >
                          {done ? '✓' : index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-ink group-hover:text-cinnabar">
                            {task.title}
                          </span>
                          <span
                            className={cn(
                              'mt-1 block text-xs leading-5',
                              done ? 'text-inkgreen' : 'text-bluegray',
                            )}
                          >
                            {done
                              ? `已完成 · ${taskState?.score}分`
                              : `未完成 · ${task.knowledgeScore}分`}
                          </span>
                        </span>
                        <span className="text-ink-soft" aria-hidden>
                          ↗
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>

            {npc ? (
              <section className="order-1 rounded-xl border border-line bg-surface p-6 lg:order-2">
                <h2 className="text-base font-semibold text-ink">守在这里的人</h2>
                <div className="mt-5 flex items-center gap-3">
                  <PersonaAvatar id={npc.id} name={npc.name} size="lg" />
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">
                      {npc.name} · {npc.title}
                    </p>
                    <span className="mt-1 inline-block text-xs text-bluegray">虚构角色</span>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-ink-soft">
                  知识边界：{npc.knowledgeScope}。越界的问题他会明说不知道。
                </p>
                <Link to={`/chat/${npc.id}`} className="btn-primary mt-5 w-full">
                  与{npc.name}对话
                </Link>
              </section>
            ) : null}
          </div>

          <section className="mt-10 border-t border-line pt-8" aria-labelledby="spot-codex-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="spot-codex-title" className="text-xl font-semibold text-ink">
                本点位文化条目
              </h2>
              <Link
                to="/codex"
                className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-inkgreen hover:text-cinnabar"
              >
                查看文化图鉴<span aria-hidden>↗</span>
              </Link>
            </div>
            <ul className="mt-3 grid gap-x-8 sm:grid-cols-2">
              {spot.codexIds.map((cid) => {
                const entry = codexEntries.find((item) => item.id === cid)
                const unlocked = unlockedCodex.includes(cid)
                return (
                  <li key={cid} className="border-t border-line py-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={cn(
                          'text-sm font-semibold',
                          unlocked ? 'text-ink' : 'text-bluegray',
                        )}
                      >
                        {unlocked ? entry?.title : '？？？'}
                      </span>
                      {unlocked && entry ? (
                        <TypeTag type={entry.type} />
                      ) : (
                        <span className="chip text-bluegray">未解锁</span>
                      )}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-ink-soft">
                      {unlocked ? entry?.summary : '完成任务或与 NPC 交谈后解锁'}
                    </p>
                  </li>
                )
              })}
            </ul>
          </section>

          {isFinaleSpot && finaleOpen ? (
            <section className="mt-10 rounded-xl border border-cinnabar/30 bg-surface p-6 sm:p-8">
              <h2 className="text-xl font-semibold text-cinnabar">尾声 · {routeInfo?.name ?? '路线终章'}</h2>
              <p className="mt-3 max-w-prose text-sm leading-7 text-ink-soft">
                这是本路线的虚构尾声。选择会决定你达成的故事结局。
              </p>
              <div
                className="mt-6 divide-y divide-line border-y border-line"
                role="radiogroup"
                aria-label="尾声选择"
              >
                {finalChoices.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    role="radio"
                    aria-checked={choice === item.key}
                    onClick={() => setChoice(item.key)}
                    onKeyDown={(event) => {
                      if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
                        event.preventDefault()
                        setChoice(item.key === 'hang' ? 'keep' : 'hang')
                        const sibling =
                          item.key === 'hang'
                            ? event.currentTarget.nextElementSibling
                            : event.currentTarget.previousElementSibling
                        if (sibling instanceof HTMLButtonElement) sibling.focus()
                      }
                    }}
                    className={cn(
                      'flex w-full items-center gap-4 px-3 py-5 text-left transition-colors',
                      choice === item.key ? 'bg-cinnabar/5' : 'hover:bg-paper-deep',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                        choice === item.key ? 'border-cinnabar' : 'border-bluegray',
                      )}
                      aria-hidden
                    >
                      {choice === item.key ? (
                        <span className="h-2.5 w-2.5 rounded-full bg-cinnabar" />
                      ) : null}
                    </span>
                    <span>
                      <span className="block font-medium text-ink">{item.label}</span>
                      <span className="mt-1 block text-sm leading-6 text-ink-soft">
                        {item.detail}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn-primary mt-6 w-full sm:w-auto"
                disabled={!choice || busy}
                onClick={confirmFinale}
              >
                确认选择，迎接结局
              </button>
              {error ? (
                <p role="alert" className="mt-3 text-sm text-danger">
                  {error}
                </p>
              ) : null}
            </section>
          ) : null}

          {isFinaleSpot && endingId ? (
            <section className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
              <p className="text-sm text-ink-soft">你已经抵达过这条路线的结局。</p>
              <Link to={`/ending/${endingId}`} className="btn-secondary">
                回顾结局
              </Link>
            </section>
          ) : null}
        </div>
      )}

      <div className="mt-10">
        <DemoDataNotice />
      </div>
    </div>
  )
}
