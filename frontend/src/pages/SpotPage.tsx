import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import PersonaAvatar from '@/components/PersonaAvatar'
import TypeTag from '@/components/TypeTag'
import SpotMedia from '@/components/SpotMedia'
import ExplorationPanel from '@/components/ExplorationPanel'
import AudioGuide from '@/components/AudioGuide'
import SourceStatus from '@/components/SourceStatus'
import { api } from '@/services/api'
import { sourceName } from '@/utils/sourceUrl'
import type { KnowledgeType } from '@/types'
import { finalChoices } from '@/data/publicRoute'
import { canEnterFinale, useJourney } from '@/engine/journeyStore'
import { cn } from '@/utils/cn'

interface PlaceKnowledge {
  id: string; title: string; content: string; content_type: KnowledgeType; source: string
  review_status: string; trust_level: string; is_demo: boolean; is_fictional: boolean; human_review_verified: boolean
  source_url: string; license: string
}
interface PlaceCulture { knowledge: PlaceKnowledge[]; source_candidates: PlaceKnowledge[] }

export default function SpotPage() {
  const { spotId } = useParams<{ spotId: string }>()
  const navigate = useNavigate()
  const spots = useJourney((s) => s.spots)
  const npcs = useJourney((s) => s.npcs)
  const tasks = useJourney((s) => s.tasks)
  const codexEntries = useJourney((s) => s.codexEntries)
  const busy = useJourney((s) => s.busy)
  const currentSpotId = useJourney((s) => s.currentSpotId)
  const journeyState = useJourney((s) => s.state)
  const mode = useJourney((s) => s.mode)
  const arriveSpot = useJourney((s) => s.arriveSpot)
  const audience = useJourney((s) => s.audienceMode)
  const [error, setError] = useState<string | null>(null)
  const spot = spots.find((item) => item.id === spotId)

  const spotStatus = useJourney((s) => s.spotStatus)
  const taskStates = useJourney((s) => s.taskStates)
  const unlockedCodex = useJourney((s) => s.unlockedCodex)
  const enterFinale = useJourney((s) => s.enterFinale)
  const finaleOpen = useJourney(canEnterFinale)
  const endingId = useJourney((s) => s.endingId)

  const [choice, setChoice] = useState<'hang' | 'keep' | null>(null)
  const [culture, setCulture] = useState<PlaceCulture | null>(null)
  const [cultureError, setCultureError] = useState('')
  useEffect(() => {
    let alive = true
    setCulture(null); setCultureError('')
    if (spotId) api.get<PlaceCulture>(`/places/${encodeURIComponent(spotId)}`)
      .then((data) => { if (alive) setCulture(data) })
      .catch(() => { if (alive) setCultureError('文化资料暂时无法加载。') })
    return () => { alive = false }
  }, [spotId])
  const cultureCard = (entry: PlaceKnowledge) => <article key={entry.id} className="min-w-0 rounded-lg border border-line p-4">
    <h3 className="font-semibold">{entry.title}</h3>
    <TypeTag type={entry.content_type} />
    <p className="mt-3 text-sm leading-7">{entry.content}</p>
    <p className="mt-2 text-xs leading-6 text-bluegray">来源：{sourceName(entry.source)}</p>
    <SourceStatus trustLevel={entry.trust_level} reviewStatus={entry.review_status} isDemo={entry.is_demo}
      isFictional={entry.is_fictional} sourceUrl={entry.source_url} license={entry.license} humanReviewVerified={entry.human_review_verified} />
  </article>

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
  const isFinaleSpot = spot.id === 'subo'
  const spotTasks = tasks.filter((task) => task.spotId === spot.id)
  const requiredTasks = spotTasks.filter((task) => !task.optional)
  const optionalTasks = spotTasks.filter((task) => task.optional)
  const completedTasks = spotTasks.filter((task) => taskStates[task.id]?.status === 'completed').length
  const needsReturn = arrived && currentSpotId !== spot.id && journeyState !== 'COMPLETED'
  const journeyComplete = journeyState === 'COMPLETED'

  const returnToSpot = async () => {
    setError(null)
    try {
      await arriveSpot(spot.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : '返回点位失败，请重试。')
    }
  }

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
    <div className="spot-page mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <nav className="flex flex-wrap items-center gap-2 text-sm text-bluegray" aria-label="面包屑">
        <Link to="/map" className="inline-flex min-h-11 items-center gap-2 hover:text-cinnabar">
          <span aria-hidden>←</span>路线地图
        </Link>
        <span aria-hidden>/</span>
        <span aria-current="page">{spot.name}</span>
      </nav>

      <header className="mt-5 grid items-center gap-7 md:grid-cols-[1fr_0.9fr] md:items-start md:gap-10">
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
          <p className="mt-3 text-xs text-bluegray">地点参考介绍</p>
          <p className="mt-1 text-base font-medium leading-7 text-inkgreen">{spot.intro}</p>
          <div className="spot-fact-card mt-4 rounded-xl border border-line p-3 text-xs leading-7 text-bluegray">
            <div>点位：{spot.name} · 第 {spot.order} 站</div>
            <div>文化事实以已审核条目为准；下方人物与剧情明确标为虚构。</div>
          </div>
          <p className="mt-4 text-xs text-bluegray">剧情设定（虚构）</p>
          <p
            className="mt-5 max-w-prose text-sm leading-7 text-ink-soft"
            style={{ textWrap: 'pretty' }}
          >
            {spot.story}
          </p>
        </div>
        <div><SpotMedia locationId={spot.id} name={spot.name} /><AudioGuide locationId={spot.id} text={audience === 'child' ? spot.intro : `${spot.intro}\n剧情设定（虚构）：${spot.story}`} audience={audience} /></div>
      </header>

      <section className="spot-highlight-card mt-5" aria-label="游览观察提示"><h2 className="font-semibold">带着问题看风景</h2><ul><li>先看图片和文字，再观察空间、材料与细节。</li><li>可主动播放讲解，向当前点位的角色提问并查看证据。</li><li>主线之外的挑战与探索可以跳过，不影响故事结局。</li></ul></section>

      <section className="mt-8 border-t border-line pt-6" aria-labelledby="spot-culture-title">
        <h2 id="spot-culture-title" className="font-serif text-xl font-semibold">文化寻访</h2>
        <p className="mt-2 text-sm leading-7 text-bluegray">从资料中读懂这里的故事，展开条目可查看来源。</p>
        {cultureError && <p role="status" className="mt-2 text-sm">{cultureError}</p>}
        {culture && <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">{culture.knowledge.map(cultureCard)}</div>
          {culture.knowledge.length === 0 && <p className="mt-3 text-sm text-bluegray">这里的资料正在整理，可展开下方参考资料继续阅读。</p>}
          {culture.source_candidates.length > 0 && <details className="mt-4 rounded-lg border border-line p-4">
            <summary className="min-h-11 cursor-pointer leading-[44px]">参考资料 · 待核验（{culture.source_candidates.length}）</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">{culture.source_candidates.map(cultureCard)}</div>
          </details>}
        </>}
      </section>

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
      ) : needsReturn ? (
        <section className="mt-10 rounded-xl border border-line bg-surface p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-ink">回到此点继续探索</h2>
          <p className="mt-3 max-w-prose text-sm leading-7 text-ink-soft">
            {mode === 'onsite'
              ? `你已到达过这里。实地模式回访仍需在地图使用当前位置，校验到达「${spot.name}」后继续任务与对话。`
              : `你已到达过这里。先把旅程当前位置切回「${spot.name}」，再继续这里的任务与对话。`}
          </p>
          {mode === 'onsite' ? <Link to="/map" className="btn-primary mt-5">去地图定位回访</Link> :
          <button type="button" className="btn-primary mt-5" disabled={busy} onClick={returnToSpot}>
            {busy ? '正在返回点位…' : '回到此点继续探索'}
          </button>}
          {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
        </section>
      ) : (
        <div className="mt-10">
          {journeyComplete && <p role="status" className="mb-6 rounded-lg border border-line bg-paper-deep p-4 text-sm leading-7 text-bluegray">旅程已结束，这里仅供只读回顾。未完成的挑战与探索可在新旅程中尝试。</p>}
          <div className="grid items-start gap-8 border-t border-line pt-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
            <section className="order-2 min-w-0 lg:order-1" aria-labelledby="spot-tasks-title">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="spot-tasks-title" className="text-xl font-semibold text-ink">
                  这里的谜题
                </h2>
                <span className="text-sm text-bluegray">已完成 {completedTasks} / {spotTasks.length}</span>
              </div>
              <div className="spot-task-progress mt-4" role="progressbar" aria-label="点位任务完成度" aria-valuemin={0} aria-valuemax={spotTasks.length || 1} aria-valuenow={completedTasks}>
                <span style={{ width: `${spotTasks.length ? completedTasks / spotTasks.length * 100 : 0}%` }} />
              </div>
              <p className="mt-2 text-sm leading-6 text-ink-soft">
                观察眼前的景物，也从对话里寻找答案。完成主线即可前往下一站，自选挑战可跳过。
              </p>
              {[{ label: '主线任务', items: requiredTasks }, { label: '自选挑战', items: optionalTasks }].map(({ label, items }) => (
                <section key={label} aria-label={label} className="mt-6">
                  <h3 className="text-sm font-semibold text-ink">{label} · {items.filter((task) => taskStates[task.id]?.status === 'completed').length}/{items.length}</h3>
                  <ul className="mt-3 divide-y divide-line border-y border-line">
                {items.map((task, index) => {
                  const tid = task.id
                  const taskState = taskStates[tid]
                  const done = taskState?.status === 'completed'
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
              ))}
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
                  {journeyComplete ? `回顾与${npc.name}的对话` : `与${npc.name}对话`}
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
              <h2 className="text-xl font-semibold text-cinnabar">尾声 · 守园灯</h2>
              <p className="mt-3 max-w-prose text-sm leading-7 text-ink-soft">
                小沈把那盏灯递到你面前。灯是剧情里的意象，不是史实，但选择是真的：它会决定你的结局。
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

      {arrived && !needsReturn && <ExplorationPanel spotId={spot.id} />}
    </div>
  )
}
