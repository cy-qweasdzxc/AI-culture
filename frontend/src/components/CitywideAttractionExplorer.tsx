import { useEffect, useMemo, useState } from 'react'
import CitywideAttractionMap, { type CitywidePlace } from '@/components/CitywideAttractionMap'
import SourceStatus from '@/components/SourceStatus'
import SpotMedia from '@/components/SpotMedia'
import { api } from '@/services/api'
import { safeSourceUrl } from '@/utils/sourceUrl'

interface Candidate {
  id: string; title: string; content: string; content_type: string; source: string
  source_url: string; license: string; review_status: string; trust_level: string
  human_review_verified: boolean; is_demo: boolean; is_fictional: boolean
}
interface Detail extends CitywidePlace { source_candidates: Candidate[] }
const photoIds = new Set(['pingjiang', 'ouyuan', 'shizilin', 'zhuozhengyuan', 'subo'])

function OpenExplorer() {
  const [places, setPlaces] = useState<CitywidePlace[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const [query, setQuery] = useState('')
  const [district, setDistrict] = useState('')
  const [category, setCategory] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [detail, setDetail] = useState<Detail | null>(null)
  const [detailError, setDetailError] = useState('')
  const [detailAttempt, setDetailAttempt] = useState(0)
  useEffect(() => {
    let alive = true
    setLoading(true); setError('')
    api.get<{ items: CitywidePlace[] }>('/cities/suzhou/attractions')
      .then((data) => { if (alive) setPlaces(data.items) })
      .catch(() => { if (alive) setError('景点目录暂时无法加载，请重试。') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [attempt])
  const districts = [...new Set(places.map((p) => p.district))].sort()
  const categories = [...new Set(places.map((p) => p.category))].sort()
  const filtered = useMemo(() => places.filter((p) => (!district || p.district === district) && (!category || p.category === category)
    && [p.name, p.address, p.district, p.category, ...p.tags].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [places, district, category, query])
  const selected = filtered.find((p) => p.id === selectedId) ?? filtered[0]
  const id = selected?.id
  useEffect(() => {
    let alive = true
    setDetail(null); setDetailError('')
    if (id) api.get<Detail>(`/cities/suzhou/attractions/${encodeURIComponent(id)}`)
      .then((data) => { if (alive) setDetail(data) })
      .catch(() => { if (alive) setDetailError('景点详情暂不可用，目录仍可浏览。') })
    return () => { alive = false }
  }, [id, detailAttempt])
  return <div className="mt-4 min-w-0 space-y-4">
    <p className="text-sm leading-7">共 {places.length} 个景点资料，当前筛选 {filtered.length} 个。这里提供资料预览，不新增可玩路线、任务或实地触发。</p>
    {loading && <p role="status">正在加载全域景点…</p>}
    {error && <p role="alert">{error} <button type="button" className="inline-link min-h-11" onClick={() => setAttempt((n) => n + 1)}>重试景点目录</button></p>}
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="min-w-0 text-sm">搜索全域景点<input type="search" className="input mt-2 w-full min-w-0" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      <label className="min-w-0 text-sm">行政区域<select className="input mt-2 w-full min-w-0" value={district} onChange={(e) => setDistrict(e.target.value)}><option value="">全部区域</option>{districts.map((d) => <option key={d}>{d}</option>)}</select></label>
      <label className="min-w-0 text-sm">景点类型<select className="input mt-2 w-full min-w-0" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">全部类型</option>{categories.map((c) => <option key={c}>{c}</option>)}</select></label>
    </div>
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <CitywideAttractionMap places={filtered} selectedId={id ?? ''} onSelect={setSelectedId} />
      <div className="max-h-80 overflow-y-auto rounded-lg border border-line p-2" aria-label="全域景点列表">
        {!filtered.length && !loading && <p className="p-3 text-sm">没有匹配的景点，请调整筛选。</p>}
        {filtered.map((p) => <button key={p.id} type="button" className="block min-h-11 w-full rounded p-3 text-left text-sm leading-6 hover:bg-paper-deep" aria-pressed={id === p.id} onClick={() => setSelectedId(p.id)}>
          <strong>{p.name}</strong><span className="block text-xs text-bluegray">{p.district} · {p.category} · 资料预览</span>
        </button>)}
      </div>
    </div>
    {selected && <article className="min-w-0 rounded-lg border border-line p-4" aria-label="全域景点详情">
      <h4 className="font-semibold">{selected.name}</h4><p className="mt-2 text-sm leading-7">{selected.intro}</p>
      <p className="mt-2 text-xs leading-6 text-bluegray">{selected.address} · 近似坐标，入口及开放情况未核验</p>
      <p className="mt-2 text-xs leading-6 text-bluegray">来源候选 · 未经独立人工事实审核，不用于 NPC 正式事实检索。</p>
      {safeSourceUrl(selected.source_url) && <a className="inline-link inline-flex min-h-11 items-center text-xs" href={safeSourceUrl(selected.source_url)} target="_blank" rel="noreferrer">原始景点资料来源：{selected.source_name}</a>}
      {photoIds.has(selected.id) ? <SpotMedia locationId={selected.id} name={selected.name} /> : <p className="my-3 rounded bg-paper-deep p-3 text-xs leading-6">该点位暂未接入已核验许可的实景照片。</p>}
      {detailError && <p role="alert" className="text-sm">{detailError} <button type="button" className="inline-link min-h-11" onClick={() => setDetailAttempt((n) => n + 1)}>重试景点详情</button></p>}
      {detail?.id === id && <div className="mt-3 space-y-3">
        <h5 className="text-sm font-semibold">待审核文化资料（{detail.source_candidates.length}）</h5>
        {detail.source_candidates.map((k) => <section key={k.id} className="rounded border border-line p-3">
          <h6 className="text-sm font-semibold">{k.title}</h6><p className="mt-2 text-sm leading-7">{k.content}</p>
          <SourceStatus trustLevel={k.trust_level} reviewStatus={k.review_status} sourceUrl={k.source_url} license={k.license} isDemo={k.is_demo} isFictional={k.is_fictional} humanReviewVerified={k.human_review_verified} />
        </section>)}
      </div>}
    </article>}
  </div>
}

export default function CitywideAttractionExplorer() {
  const [open, setOpen] = useState(false)
  return <details className="mt-8 min-w-0 rounded-xl border border-line p-4" onToggle={(e) => setOpen(e.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer font-semibold leading-7">苏州全域景点资料（50 处，资料预览）</summary>
    {open && <OpenExplorer />}
  </details>
}
