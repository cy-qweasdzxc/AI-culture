import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Drawer from '@/components/Drawer'
import TypeTag from '@/components/TypeTag'
import SourceStatus from '@/components/SourceStatus'
import { sourceName } from '@/utils/sourceUrl'
import { knowledgeTypeLabel } from '@/data/knowledgeLabels'
import { useJourney } from '@/engine/journeyStore'
import type { KnowledgeType } from '@/types'
import { cn } from '@/utils/cn'

const typeFilters: { key: KnowledgeType | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'fact', label: '史实条目' },
  { key: 'disputed', label: '争议观点' },
  { key: 'legend', label: '民间传说' },
  { key: 'fiction', label: '艺术化虚构' },
]

export default function CodexPage() {
  const unlockedCodex = useJourney((s) => s.unlockedCodex)
  const state = useJourney((s) => s.state)
  const codexEntries = useJourney((s) => s.codexEntries)
  const total = useJourney((s) => s.codexTotal)
  const spots = useJourney((s) => s.spots)

  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<KnowledgeType | 'all'>('all')
  const [detailId, setDetailId] = useState<string | null>(null)

  const unlocked = useMemo(
    () => codexEntries.filter((entry) => unlockedCodex.includes(entry.id)),
    [codexEntries, unlockedCodex],
  )
  const lockedCount = Math.max(0, total - unlocked.length)

  const visibleUnlocked = useMemo(() => {
    const keyword = query.trim()
    return unlocked.filter((entry) => {
      if (typeFilter !== 'all' && entry.type !== typeFilter) return false
      if (
        keyword &&
        !entry.title.includes(keyword) &&
        !entry.summary.includes(keyword) &&
        !entry.content.includes(keyword)
      )
        return false
      return true
    })
  }, [unlocked, query, typeFilter])

  const detail = detailId
    ? codexEntries.find((entry) => entry.id === detailId && unlockedCodex.includes(entry.id))
    : undefined

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-prose">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            文化图鉴
          </h1>
          <p className="mt-3 text-sm leading-6 text-ink-soft">
            已解锁 {unlocked.length} / {total} 条。每条都标注可信等级与来源；未解锁条目只显示轮廓。
          </p>
        </div>
        <Link
          to="/map"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-inkgreen hover:text-cinnabar"
        >
          继续探索路线<span aria-hidden>↗</span>
        </Link>
      </header>

      <section className="mt-8 border-y border-line py-5" aria-label="图鉴检索与筛选">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div className="w-full lg:max-w-sm">
            <label htmlFor="codex-search" className="mb-2 block text-sm font-medium text-ink">
              检索已解锁条目
            </label>
            <input
              id="codex-search"
              type="search"
              className="input"
              placeholder="输入名称、知识点或关键词…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="按可信等级筛选">
            {typeFilters.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setTypeFilter(filter.key)}
                aria-pressed={typeFilter === filter.key}
                className={cn(
                  'min-h-11 rounded-md border px-3 text-sm font-medium transition-colors',
                  typeFilter === filter.key
                    ? 'border-inkgreen bg-inkgreen text-white'
                    : 'border-transparent text-ink-soft hover:border-line hover:bg-surface',
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {state === 'CREATED' ? (
        <section className="mt-8 rounded-xl border border-dashed border-line bg-surface px-6 py-12 sm:px-10">
          <h2 className="text-xl font-semibold text-ink">从第一站，收集一座城的故事</h2>
          <p className="mt-3 max-w-prose text-sm leading-7 text-ink-soft">
            还没有开始旅程。开始体验后，解锁的文化条目会出现在这里。
          </p>
          <Link to="/theme" className="btn-primary mt-6">
            选择主题，开始旅程
          </Link>
        </section>
      ) : (
        <>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink">已收录的故事</h2>
            <p className="text-sm text-bluegray" role="status" aria-live="polite">
              {visibleUnlocked.length} 条
              {query.trim() || typeFilter !== 'all' ? '匹配结果' : '已解锁条目'}
            </p>
          </div>
          {visibleUnlocked.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed border-line bg-surface px-6 py-10">
              <p className="max-w-prose text-sm leading-7 text-ink-soft">
                {unlocked.length === 0
                  ? '还没有解锁任何条目，去完成任务或与 NPC 交谈吧。'
                  : '没有匹配的条目，换个关键词或筛选试试。'}
              </p>
              {unlocked.length === 0 ? (
                <Link to="/map" className="btn-primary mt-5">
                  前往路线地图
                </Link>
              ) : (
                <button
                  type="button"
                  className="btn-secondary mt-5"
                  onClick={() => {
                    setQuery('')
                    setTypeFilter('all')
                  }}
                >
                  清除检索条件
                </button>
              )}
            </div>
          ) : (
            <ul className="mt-5 grid gap-4 md:grid-cols-2">
              {visibleUnlocked.map((entry) => (
                <li key={entry.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => setDetailId(entry.id)}
                    className="card group flex h-full w-full flex-col p-5 text-left transition-colors hover:border-inkgreen sm:p-6"
                  >
                    <div className="flex w-full flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-bluegray">
                        {spots.find((spot) => spot.id === entry.spotId)?.name ?? '旅程点位'}
                      </span>
                      <TypeTag type={entry.type} />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold leading-7 text-ink group-hover:text-cinnabar">
                      {entry.title}
                    </h3>
                    <p className="mt-2 flex-1 text-sm leading-7 text-ink-soft">{entry.summary}</p>
                    <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-inkgreen">
                      阅读条目与来源<span aria-hidden>↗</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {lockedCount > 0 ? (
            <section className="mt-10 border-t border-line pt-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-ink">未解锁（{lockedCount}）</h2>
                <p className="text-xs leading-5 text-bluegray">
                  继续探索路线，完成任务或与 NPC 交谈后解锁
                </p>
              </div>
              <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: lockedCount }, (_, index) => (
                  <li
                    key={index}
                    className="rounded-lg border border-dashed border-line px-4 py-5"
                    aria-label="未解锁文化条目"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-bluegray">？？？</span>
                      <span className="text-xs text-bluegray">未解锁</span>
                    </div>
                    <div className="mt-4 h-px w-4/5 bg-line" aria-hidden />
                    <div className="mt-2 h-px w-1/2 bg-line" aria-hidden />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}


      <Drawer open={!!detail} onClose={() => setDetailId(null)} title={detail?.title ?? ''}>
        {detail ? (
          <article>
            <div className="flex flex-wrap items-center gap-2">
              <TypeTag type={detail.type} />
              <span className="text-xs text-bluegray">
                {spots.find((spot) => spot.id === detail.spotId)?.name}
              </span>
            </div>
            <h2 className="mt-5 text-xl font-semibold leading-8 text-ink">{detail.title}</h2>
            <p className="mt-3 text-sm font-medium leading-7 text-inkgreen">{detail.summary}</p>
            <p className="mt-5 text-sm leading-7 text-ink-soft" style={{ textWrap: 'pretty' }}>
              {detail.content}
            </p>
            <section className="mt-7 border-t border-line pt-5">
              <h3 className="text-sm font-semibold text-ink">来源</h3>
              <p className="mt-2 break-words text-xs leading-6 text-ink-soft">{sourceName(detail.source)}</p>
              <SourceStatus trustLevel={detail.trustLevel} reviewStatus={detail.reviewStatus} sourceUrl={detail.sourceUrl} license={detail.license} isDemo={detail.isDemo} isFictional={detail.isFictional ?? detail.type === 'fiction'} humanReviewVerified={detail.humanReviewVerified} />
            </section>
            <p className="mt-6 border-t border-line pt-4 text-xs leading-6 text-bluegray">
              所属点位：{spots.find((spot) => spot.id === detail.spotId)?.name} · 内容类型：
              {knowledgeTypeLabel[detail.type]}
            </p>
          </article>
        ) : null}
      </Drawer>
    </div>
  )
}
