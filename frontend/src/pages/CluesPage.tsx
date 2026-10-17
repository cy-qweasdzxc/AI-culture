import { useState } from 'react'
import { Link } from 'react-router-dom'
import PersonaAvatar from '@/components/PersonaAvatar'
import { useJourney } from '@/engine/journeyStore'
import { cn } from '@/utils/cn'

type Tab = 'clue' | 'item' | 'relation'

const tabMeta: { key: Tab; label: string }[] = [
  { key: 'clue', label: '线索' },
  { key: 'item', label: '道具' },
  { key: 'relation', label: '人物关系' },
]

function relationLevel(messageCount: number): { label: string; cls: string } {
  if (messageCount >= 8)
    return { label: '信任', cls: 'border-inkgreen/25 bg-inkgreen/5 text-inkgreen' }
  if (messageCount >= 2)
    return { label: '初识', cls: 'border-bluegray/25 bg-paper-deep text-ink-soft' }
  return { label: '陌生', cls: 'bg-paper-deep text-bluegray' }
}

export default function CluesPage() {
  const inventory = useJourney((s) => s.inventory)
  const messages = useJourney((s) => s.messages)
  const clues = useJourney((s) => s.clues)
  const npcs = useJourney((s) => s.npcs)
  const spots = useJourney((s) => s.spots)
  const [tab, setTab] = useState<Tab>('clue')

  const items = clues.filter((item) => inventory.includes(item.id))
  const filtered = items.filter((item) => tab !== 'relation' && item.kind === tab)
  const counts: Record<Tab, number> = {
    clue: items.filter((item) => item.kind === 'clue').length,
    item: items.filter((item) => item.kind === 'item').length,
    relation: npcs.length,
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            线索背包
          </h1>
          <p className="mt-3 max-w-prose text-sm leading-6 text-ink-soft">
            一路上获得的线索、道具，以及和 NPC 的关系。
          </p>
        </div>
        <Link
          to="/map"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-inkgreen hover:text-cinnabar"
        >
          继续探索路线<span aria-hidden>↗</span>
        </Link>
      </header>

      <div className="mt-8 flex border-b border-line" role="tablist" aria-label="背包分类">
        {tabMeta.map((item, index) => (
          <button
            key={item.key}
            id={`backpack-tab-${item.key}`}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            aria-controls="backpack-panel"
            tabIndex={tab === item.key ? 0 : -1}
            onClick={() => setTab(item.key)}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
              event.preventDefault()
              const nextIndex =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? tabMeta.length - 1
                    : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabMeta.length) %
                      tabMeta.length
              setTab(tabMeta[nextIndex].key)
              document.getElementById(`backpack-tab-${tabMeta[nextIndex].key}`)?.focus()
            }}
            className={cn(
              'flex min-h-12 items-center gap-2 border-b-2 px-3 text-sm transition-colors sm:px-6',
              tab === item.key
                ? 'border-cinnabar font-semibold text-cinnabar'
                : 'border-transparent text-ink-soft hover:text-ink',
            )}
          >
            {item.label}
            <span className="text-xs tabular-nums" aria-hidden>
              {counts[item.key]}
            </span>
          </button>
        ))}
      </div>

      <div className="grid gap-10 pt-8 lg:grid-cols-[minmax(0,1fr)_240px]">
        <section
          id="backpack-panel"
          role="tabpanel"
          aria-labelledby={`backpack-tab-${tab}`}
          className="min-w-0"
        >
          {tab !== 'relation' ? (
            filtered.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-12 sm:px-10">
                <h2 className="text-xl font-semibold text-ink">
                  {tab === 'clue' ? '下一条线索，藏在对话里' : '为旅程留一些收获'}
                </h2>
                <p className="mt-3 max-w-prose text-sm leading-7 text-ink-soft">
                  {tab === 'clue'
                    ? '还没有线索。去和 NPC 聊聊，或完成任务。'
                    : '还没有道具。角色初始道具和任务奖励会出现在这里。'}
                </p>
                <Link to="/map" className="btn-primary mt-6">
                  前往路线地图
                </Link>
              </div>
            ) : (
              <ul className="grid gap-x-8 sm:grid-cols-2">
                {filtered.map((item) => (
                  <li
                    key={item.id}
                    className="border-b border-line pb-6 pt-5 first:pt-0 sm:[&:nth-child(2)]:pt-0"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <h2 className="text-lg font-semibold text-ink">{item.name}</h2>
                      <span className="chip shrink-0 text-bluegray">
                        {item.kind === 'clue' ? '线索' : '道具'}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-ink-soft">{item.description}</p>
                    {item.fromSpotId ? (
                      <p className="mt-4 text-xs leading-5 text-bluegray">
                        来自：
                        {spots.find((spot) => spot.id === item.fromSpotId)?.name ?? '旅程点位'}
                      </p>
                    ) : (
                      <p className="mt-4 text-xs leading-5 text-bluegray">旅程随身物品</p>
                    )}
                  </li>
                ))}
              </ul>
            )
          ) : npcs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-12">
              <h2 className="text-xl font-semibold text-ink">先去认识一位讲故事的人</h2>
              <p className="mt-3 text-sm leading-7 text-ink-soft">
                到达路线点位后，和守在那里的 NPC 开启对话。
              </p>
              <Link to="/map" className="btn-primary mt-6">
                前往路线地图
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface px-5 sm:px-6">
              {npcs.map((npc) => {
                const count = new Set(
                  Object.entries(messages).flatMap(([threadId, thread]) =>
                    thread
                      .filter(
                        (message) =>
                          message.from === 'npc' && (message.npcId ?? threadId) === npc.id,
                      )
                      .map((message) => message.turnId ?? message.id),
                  ),
                ).size
                const relation = relationLevel(count)
                return (
                  <li key={npc.id} className="flex flex-wrap items-center gap-4 py-6">
                    <PersonaAvatar id={npc.id} name={npc.name} size="lg" />
                    <div className="min-w-0 flex-1">
                      <h2 className="font-semibold leading-6 text-ink">
                        {npc.name}
                        <span className="mt-0.5 block text-xs font-normal text-bluegray sm:ml-2 sm:inline">
                          · {npc.title}
                        </span>
                      </h2>
                      <p className="mt-2 text-xs text-bluegray">对话 {count} 轮</p>
                    </div>
                    <span className={cn('chip', relation.cls)}>{relation.label}</span>
                    <Link
                      to={`/chat/${npc.id}`}
                      className="inline-flex min-h-11 w-full items-center justify-end gap-2 text-sm font-medium text-inkgreen hover:text-cinnabar sm:w-auto"
                      aria-label={`与${npc.name}继续对话`}
                    >
                      继续对话<span aria-hidden>↗</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <aside className="border-t border-line pt-6 lg:border-t-0 lg:pt-0">
          <h2 className="text-base font-semibold text-ink">把故事带在身边</h2>
          <p className="mt-3 text-sm leading-7 text-ink-soft">
            {tab === 'relation'
              ? '每一次提问都会留在对话记录里。回到人物身边，可以接着上次的话题聊。'
              : '对话与解谜中获得的内容会自动收入背包。解题时，记得回来翻一翻。'}
          </p>
          <div className="mt-6 border-t border-line pt-5">
            <p className="text-xs font-medium text-bluegray">旅程收藏</p>
            <p className="mt-2 text-sm leading-6 text-ink">
              <span className="font-semibold tabular-nums">{counts.clue}</span> 条线索{' '}
              <span className="mx-2 text-line" aria-hidden>
                /
              </span>
              <span className="font-semibold tabular-nums">{counts.item}</span> 件道具
            </p>
            <Link
              to="/codex"
              className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-inkgreen hover:text-cinnabar"
            >
              翻看文化图鉴<span aria-hidden>↗</span>
            </Link>
          </div>
        </aside>
      </div>
    </div>
  )
}
