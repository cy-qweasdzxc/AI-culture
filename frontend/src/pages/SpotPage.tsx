import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import SealMark from '@/components/SealMark'
import TypeTag from '@/components/TypeTag'
import { codexById } from '@/data/codex'
import { finalChoices } from '@/data/endings'
import { npcById } from '@/data/npcs'
import { spotById } from '@/data/theme'
import { taskById } from '@/data/tasks'
import { canEnterFinale, useJourney } from '@/engine/journeyStore'
import { cn } from '@/utils/cn'

export default function SpotPage() {
  const { spotId } = useParams<{ spotId: string }>()
  const navigate = useNavigate()
  const spot = spotId ? spotById.get(spotId) : undefined

  const spotStatus = useJourney((s) => s.spotStatus)
  const taskStates = useJourney((s) => s.taskStates)
  const unlockedCodex = useJourney((s) => s.unlockedCodex)
  const enterFinale = useJourney((s) => s.enterFinale)
  const finaleOpen = useJourney(canEnterFinale)
  const endingId = useJourney((s) => s.endingId)

  const [choice, setChoice] = useState<'hang' | 'keep' | null>(null)

  if (!spot) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="font-serif text-2xl font-bold text-ink">点位不存在</h1>
        <Link to="/map" className="mt-4 inline-block text-cinnabar underline">
          返回路线地图
        </Link>
      </div>
    )
  }

  const status = spotStatus[spot.id] ?? 'undiscovered'
  const npc = spot.npcId ? npcById.get(spot.npcId) : undefined
  const arrived = status === 'current' || status === 'completed'
  const isFinaleSpot = spot.id === 'subo'

  const confirmFinale = () => {
    if (!choice) return
    const id = enterFinale(choice)
    navigate(`/ending/${id}`)
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <nav className="text-xs text-bluegray" aria-label="面包屑">
        <Link to="/map" className="hover:text-cinnabar">
          路线地图
        </Link>
        <span className="mx-1">/</span>
        <span>{spot.name}</span>
      </nav>

      <header className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-ink">{spot.name}</h1>
          <p className="mt-1 text-sm font-medium text-bronze">{spot.intro}</p>
        </div>
        <SealMark text={spot.shortName.slice(0, 2)} className="h-12 w-12 text-base" />
      </header>

      <p className="mt-5 max-w-prose text-sm leading-relaxed text-ink-soft" style={{ textWrap: 'pretty' }}>
        {spot.story}
      </p>

      {!arrived ? (
        <div className="card mt-8 p-6 text-center">
          <p className="text-sm text-bluegray">
            {status === 'discovered' ? '你已发现这个点位，但还没有到达。到达后才能开启这里的剧情。' : '这个点位尚未解锁，先完成前一个点位的任务。'}
          </p>
          <Link to="/map" className="btn-primary mt-4 inline-flex">
            去地图到达
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {/* NPC 入口 */}
          {npc ? (
            <section className="card flex flex-col p-6">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-lg font-bold text-inkgreen">守在这里的人</h2>
                <span className="chip text-bluegray">虚构角色</span>
              </div>
              <p className="mt-3 text-sm font-medium text-ink">
                {npc.name} · {npc.title}
              </p>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-soft">
                知识边界：{npc.knowledgeScope}。越界的问题他会明说不知道。
              </p>
              <Link to={`/chat/${npc.id}`} className="btn-primary mt-4 self-start">
                与{npc.name}对话
              </Link>
            </section>
          ) : null}

          {/* 任务列表 */}
          <section className="card p-6">
            <h2 className="font-serif text-lg font-bold text-inkgreen">这里的谜题</h2>
            <ul className="mt-3 space-y-2">
              {spot.taskIds.map((tid) => {
                const task = taskById.get(tid)
                const st = taskStates[tid]
                const done = st?.status === 'completed'
                if (!task) return null
                return (
                  <li key={tid}>
                    <Link
                      to={`/task/${tid}`}
                      className={cn(
                        'flex items-center justify-between rounded-md border p-3 text-sm transition-colors',
                        done ? 'border-inkgreen/40 bg-inkgreen/5' : 'border-line hover:border-bronze',
                      )}
                    >
                      <span className="font-medium text-ink">{task.title}</span>
                      <span className={cn('chip', done ? 'bg-inkgreen text-white' : 'text-bluegray')}>
                        {done ? `已完成 · ${st?.score}分` : `未完成 · ${task.knowledgeScore}分`}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>

          {/* 本点位图鉴 */}
          <section className="card p-6 md:col-span-2">
            <h2 className="font-serif text-lg font-bold text-inkgreen">本点位文化条目</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {spot.codexIds.map((cid) => {
                const entry = codexById.get(cid)
                const unlocked = unlockedCodex.includes(cid)
                if (!entry) return null
                return (
                  <li key={cid} className={cn('rounded-md border p-3', unlocked ? 'border-line' : 'border-dashed border-line bg-paper-deep/50')}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn('text-sm font-medium', unlocked ? 'text-ink' : 'text-bluegray')}>
                        {unlocked ? entry.title : '？？？'}
                      </span>
                      {unlocked ? <TypeTag type={entry.type} /> : <span className="chip text-bluegray">未解锁</span>}
                    </div>
                    <p className="mt-1 text-xs text-bluegray">{unlocked ? entry.summary : '完成任务或与 NPC 交谈后解锁'}</p>
                  </li>
                )
              })}
            </ul>
          </section>

          {/* 尾声（仅苏博） */}
          {isFinaleSpot && finaleOpen ? (
            <section className="card border-cinnabar/50 p-6 md:col-span-2">
              <h2 className="font-serif text-lg font-bold text-cinnabar">尾声 · 守园灯</h2>
              <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-soft">
                小沈把那盏灯递到你面前。灯是剧情里的意象，不是史实，但选择是真的：它会决定你的结局。
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="尾声选择">
                {finalChoices.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    role="radio"
                    aria-checked={choice === c.key}
                    onClick={() => setChoice(c.key)}
                    className={cn(
                      'rounded-md border p-4 text-left transition-colors',
                      choice === c.key ? 'border-cinnabar ring-2 ring-cinnabar/25' : 'border-line hover:border-bronze',
                    )}
                  >
                    <span className="block font-medium text-ink">{c.label}</span>
                    <span className="mt-1 block text-xs text-bluegray">{c.detail}</span>
                  </button>
                ))}
              </div>
              <button type="button" className="btn-primary mt-4" disabled={!choice} onClick={confirmFinale}>
                确认选择，迎接结局
              </button>
            </section>
          ) : null}

          {isFinaleSpot && endingId ? (
            <section className="card p-6 text-center md:col-span-2">
              <p className="text-sm text-ink-soft">你已经抵达过这条路线的结局。</p>
              <Link to={`/ending/${endingId}`} className="btn-secondary mt-3 inline-flex">
                回顾结局
              </Link>
            </section>
          ) : null}
        </div>
      )}
    </div>
  )
}
