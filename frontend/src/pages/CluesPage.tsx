import { useState } from 'react'
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
  if (messageCount >= 8) return { label: '信任', cls: 'bg-inkgreen text-white' }
  if (messageCount >= 2) return { label: '初识', cls: 'bg-bronze/15 text-bronze' }
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
  const filtered = items.filter((c) => (tab === 'relation' ? false : c!.kind === tab))

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="font-serif text-2xl font-bold text-ink">线索背包</h1>
      <p className="mt-2 text-sm text-bluegray">一路上获得的线索、道具，以及和 NPC 的关系。</p>

      <div className="mt-5 flex gap-1 border-b border-line" role="tablist" aria-label="背包分类">
        {tabMeta.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'min-h-11 border-b-2 px-4 text-sm transition-colors',
              tab === t.key
                ? 'border-cinnabar font-medium text-cinnabar'
                : 'border-transparent text-ink-soft hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab !== 'relation' ? (
        filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-bluegray">
              {tab === 'clue'
                ? '还没有线索。去和 NPC 聊聊，或完成任务。'
                : '还没有道具。角色初始道具和任务奖励会出现在这里。'}
            </p>
          </div>
        ) : (
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {filtered.map((c) => (
              <li key={c!.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-medium text-ink">{c!.name}</h2>
                  <span className="chip text-bluegray">{c!.kind === 'clue' ? '线索' : '道具'}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{c!.description}</p>
                {c!.fromSpotId ? (
                  <p className="mt-2 text-xs text-bluegray">
                    来自：{spots.find((spot) => spot.id === c!.fromSpotId)?.name ?? '旅程点位'}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : (
        <ul className="mt-5 space-y-3">
          {npcs.map((n) => {
            const count = (messages[n.id] ?? []).filter((m) => m.from === 'user').length
            const rel = relationLevel(count)
            return (
              <li key={n.id} className="card flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <PersonaAvatar id={n.id} name={n.name} size="lg" />
                  <div>
                    <h2 className="font-medium text-ink">
                      {n.name} <span className="text-xs font-normal text-bluegray">· {n.title}</span>
                    </h2>
                    <p className="mt-1 text-xs text-bluegray">对话 {count} 轮</p>
                  </div>
                </div>
                <span className={cn('chip', rel.cls)}>{rel.label}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
