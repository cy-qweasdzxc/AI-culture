import { useMemo, useState } from 'react'
import Drawer from '@/components/Drawer'
import TypeTag from '@/components/TypeTag'
import { codexEntries, knowledgeTypeLabel } from '@/data/codex'
import { spotById } from '@/data/theme'
import { useJourney } from '@/engine/journeyStore'
import type { KnowledgeType } from '@/types'
import { cn } from '@/utils/cn'

const typeFilters: { key: KnowledgeType | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'fact', label: '可靠史实' },
  { key: 'disputed', label: '争议观点' },
  { key: 'legend', label: '民间传说' },
  { key: 'fiction', label: '艺术化虚构' },
]

export default function CodexPage() {
  const unlockedCodex = useJourney((s) => s.unlockedCodex)
  const state = useJourney((s) => s.state)

  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<KnowledgeType | 'all'>('all')
  const [detailId, setDetailId] = useState<string | null>(null)

  const unlocked = codexEntries.filter((e) => unlockedCodex.includes(e.id))
  const locked = codexEntries.filter((e) => !unlockedCodex.includes(e.id))

  const visibleUnlocked = useMemo(() => {
    const q = query.trim()
    return unlocked.filter((e) => {
      if (typeFilter !== 'all' && e.type !== typeFilter) return false
      if (q && !e.title.includes(q) && !e.summary.includes(q) && !e.content.includes(q)) return false
      return true
    })
  }, [unlocked, query, typeFilter])

  const detail = detailId ? codexEntries.find((e) => e.id === detailId && unlockedCodex.includes(e.id)) : undefined

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink">文化图鉴</h1>
          <p className="mt-2 text-sm text-bluegray">
            已解锁 {unlocked.length} / {codexEntries.length} 条。每条都标注可信等级与来源；未解锁条目只显示轮廓。
          </p>
        </div>
        <div className="w-full sm:w-64">
          <label htmlFor="codex-search" className="sr-only">
            检索已解锁条目
          </label>
          <input
            id="codex-search"
            className="input"
            placeholder="检索已解锁条目…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="按可信等级筛选">
        {typeFilters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setTypeFilter(f.key)}
            aria-pressed={typeFilter === f.key}
            className={cn('chip min-h-8 px-3', typeFilter === f.key ? 'border-cinnabar bg-cinnabar text-white' : 'text-ink-soft hover:text-ink')}
          >
            {f.label}
          </button>
        ))}
      </div>

      {state === 'CREATED' ? (
        <div className="mt-10 rounded-md border border-dashed border-line p-10 text-center text-sm text-bluegray">
          还没有开始旅程。开始体验后，解锁的文化条目会出现在这里。
        </div>
      ) : (
        <>
          {visibleUnlocked.length === 0 ? (
            <p className="mt-10 text-center text-sm text-bluegray">
              {unlocked.length === 0 ? '还没有解锁任何条目，去完成任务或与 NPC 交谈吧。' : '没有匹配的条目，换个关键词或筛选试试。'}
            </p>
          ) : (
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleUnlocked.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setDetailId(e.id)}
                    className="card anim-fade-rise h-full w-full p-5 text-left transition-colors hover:border-bronze"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="font-serif text-base font-bold text-ink">{e.title}</h2>
                      <TypeTag type={e.type} />
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-ink-soft">{e.summary}</p>
                    <p className="mt-3 text-xs text-bluegray">{spotById.get(e.spotId)?.name}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {locked.length > 0 ? (
            <section className="mt-10">
              <h2 className="text-sm font-medium text-bluegray">未解锁（{locked.length}）</h2>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {locked.map((e) => (
                  <li key={e.id} className="rounded-lg border border-dashed border-line bg-paper-deep/40 p-5" aria-label={`未解锁条目，位于${spotById.get(e.spotId)?.name}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-serif text-base font-bold text-bluegray">？？？</span>
                      <span className="chip text-bluegray">未解锁</span>
                    </div>
                    <p className="mt-2 text-xs text-bluegray">
                      前往「{spotById.get(e.spotId)?.name}」，完成任务或与 NPC 交谈后解锁
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      {/* 详情抽屉 */}
      <Drawer open={!!detail} onClose={() => setDetailId(null)} title={detail?.title ?? ''}>
        {detail ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-serif text-xl font-bold text-ink">{detail.title}</h2>
              <TypeTag type={detail.type} />
            </div>
            <p className="text-sm font-medium text-bronze">{detail.summary}</p>
            <p className="text-sm leading-relaxed text-ink-soft" style={{ textWrap: 'pretty' }}>
              {detail.content}
            </p>
            <div className="rounded-md bg-paper-deep p-3">
              <h3 className="text-xs font-medium text-ink">来源</h3>
              <p className="mt-1 text-xs leading-relaxed text-bluegray">{detail.source}</p>
            </div>
            <p className="text-xs text-bluegray">
              所属点位：{spotById.get(detail.spotId)?.name} · 可信等级：{knowledgeTypeLabel[detail.type]}
            </p>
          </div>
        ) : null}
      </Drawer>
    </div>
  )
}
