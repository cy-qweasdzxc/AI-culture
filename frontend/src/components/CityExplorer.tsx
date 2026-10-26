import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/services/api'
import { useJourney } from '@/engine/journeyStore'
import { safeSourceUrl } from '@/utils/sourceUrl'

type Status = 'open' | 'demo' | 'building' | 'planned'
interface City { id: string; name: string; status: Status; theme: string }
interface Place { id: string; name: string; status: Status; intro?: string; note?: string; source_url?: string; coordinate_status?: string; source_checked_at?: string }
interface Route { id: string; name: string; city_id: string; story_id: string; status: Status; playable: boolean; onsite_ready?: boolean; note?: string; stops: {id:string}[] }
interface Recommendation { route_id:string; name:string; preview_only:boolean; reasons:string[]; estimated_visit_minutes:number|null; walking_distance_m:number|null; stop_ids:string[] }
const statusLabels:Record<Status,string> = {open:'在线可玩', demo:'片段预览', building:'建设中', planned:'规划中'}

export default function CityExplorer() {
  const [cities, setCities] = useState<City[]>([])
  const [selected, setSelected] = useState('suzhou')
  const [places, setPlaces] = useState<Place[]>([])
  const [routes, setRoutes] = useState<Route[]>([])
  const [selectedRouteId, setSelectedRouteId] = useState('')
  const [recommended, setRecommended] = useState<Recommendation[] | null>(null)
  const [budget, setBudget] = useState('')
  const [interest, setInterest] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const audience = useJourney((s) => s.audienceMode ?? 'adult')
  const difficulty = useJourney((s) => s.difficulty ?? 'normal')
  useEffect(() => {
    let alive = true
    api.get<{items:City[]}>('/cities').then((data) => { if (alive) setCities(data.items) }).catch((err:Error) => { if (alive) setError(err.message) })
    return () => { alive = false }
  }, [])
  useEffect(() => {
    let alive = true
    setLoading(true); setRecommended(null); setError(''); setPlaces([]); setRoutes([])
    Promise.all([api.get<{items:Place[]}>(`/cities/${selected}/places`), api.get<{items:Route[]}>(`/cities/${selected}/routes`)])
      .then(([p,r]) => { if (alive) {
        setPlaces(p.items)
        setRoutes(r.items)
        setSelectedRouteId(r.items.find((route) => route.playable)?.id ?? r.items[0]?.id ?? '')
      } })
      .catch((err:Error) => { if (alive) setError(err.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [selected])
  async function recommend() {
    setLoading(true); setError('')
    try {
      const data = await api.post<{items:Recommendation[]}>('/routes/recommend', {
        city_id:selected, audience_mode:audience, difficulty,
        ...(budget ? {time_budget_minutes:Number(budget)} : {}), interests:interest ? [interest] : [],
        ...(selected === 'suzhou' && useJourney.getState().journeyId ? {journey_id:useJourney.getState().journeyId} : {}),
      })
      setRecommended(data.items)
    } catch (err) { setError(err instanceof Error ? err.message : '推荐暂不可用') }
    finally { setLoading(false) }
  }
  const city = cities.find((c) => c.id === selected)
  const selectedRoute = routes.find((route) => route.id === selectedRouteId)
  return <section id="city-catalog" className="mt-10 border-t border-line py-8" aria-labelledby="city-catalog-title">
    <h2 id="city-catalog-title" className="font-serif text-2xl font-semibold">选择城市与路线</h2>
    <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4" role="group" aria-label="城市选择">
      {cities.map((c) => <button key={c.id} disabled={loading} className={`min-h-24 rounded-lg border p-4 text-left ${c.id === selected ? 'border-cinnabar bg-cinnabar/5' : 'border-line bg-surface'}`} aria-pressed={c.id === selected} onClick={() => setSelected(c.id)}>
        <span className="block font-semibold">{c.name} · {statusLabels[c.status]}</span><span className="mt-2 block text-xs leading-5 text-bluegray">{c.theme}</span>
      </button>)}
    </div>
    {city && <p className="mt-4 text-sm leading-7">{city.name} · {statusLabels[city.status]}。{city.status === 'open' ? '已开放路线可在线完整体验；现场入口与步行顺序会单独标明核验状态。' : '仅提供地点与来源预览，尚未开放完整剧情、任务及结局。'}</p>}
    {loading && <p role="status" className="mt-3 text-sm">正在读取路线…</p>}
    {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    {routes.length > 0 && <>
      <div className="mt-4 grid gap-3 lg:grid-cols-3" role="group" aria-label={`${city?.name ?? '当前城市'}路线选择`}>
        {routes.map((route) => <article key={route.id} className={`rounded-lg border bg-surface p-4 ${route.id === selectedRouteId ? 'border-cinnabar ring-1 ring-cinnabar/30' : 'border-line'}`}>
          <button type="button" aria-pressed={route.id === selectedRouteId} disabled={loading} onClick={() => setSelectedRouteId(route.id)} className="min-h-11 w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-cinnabar">
            <span className="block font-semibold">{route.name}</span>
            <span className="mt-2 block text-xs text-bluegray">{statusLabels[route.status]}{route.playable ? ` · ${route.onsite_ready ? '可开始旅程' : '仅虚拟游览'}` : ' · 暂不可开始旅程'}</span>
          </button>
          <p className="mt-2 text-sm leading-7">{route.note ?? '五站按序解锁，保留全部主线任务与结局。'}</p>
          {route.stops.length > 0 && <details className="mt-2 text-sm"><summary className="min-h-11 cursor-pointer leading-[44px]">查看路线点位</summary><ol className="list-inside list-decimal leading-7">{route.stops.map((stop) => <li key={stop.id}>{places.find((p) => p.id === stop.id)?.name ?? stop.id}</li>)}</ol>{!route.playable && <p className="mt-2 text-xs leading-6 text-bluegray">片段路线仅供预览，完整结局仍需完成经典主线。</p>}</details>}
        </article>)}
      </div>
      {selectedRoute?.playable
        ? <Link className="btn-primary mt-4 inline-flex" to={`/role?city=${encodeURIComponent(selected)}&story=${encodeURIComponent(selectedRoute.story_id)}&route=${encodeURIComponent(selectedRoute.id)}`}>使用「{selectedRoute.name}」开始体验</Link>
        : selectedRoute && <p className="mt-4 rounded-md bg-paper-deep px-4 py-3 text-sm leading-6 text-ink-soft" role="status">已选择「{selectedRoute.name}」。这条路线目前仅供预览，尚未开放旅程。</p>}
    </>}
    {!loading && routes.length === 0 && <p className="mt-4 rounded-md bg-paper-deep px-4 py-3 text-sm leading-6 text-ink-soft">该城市还没有可选择的路线；可以先浏览下方地点资料。</p>}
    <details className="mt-5 rounded-lg border border-line bg-surface p-4" open={city?.status !== 'open'}>
      <summary className="min-h-11 cursor-pointer font-semibold leading-[44px]">地点与可选支线预览</summary>
      <div className="grid gap-4 pt-3 sm:grid-cols-2 lg:grid-cols-3">
        {places.map((place) => <article key={place.id} className="min-w-0 border-t border-line pt-3">
          <h3 className="font-semibold">{place.name}</h3><p className="mt-1 text-xs text-bluegray">{statusLabels[place.status]} · {place.coordinate_status === 'approximate_demo' ? '示意坐标，入口未核验' : '开放安排待确认'}</p>
          <p className="mt-2 text-sm leading-7">{place.intro ?? place.note ?? '详情可在主线解锁后查看。'}</p>
          {safeSourceUrl(place.source_url) && <a className="inline-link mt-2 inline-flex min-h-11 items-center text-xs" href={safeSourceUrl(place.source_url)} target="_blank" rel="noreferrer">原始资料来源</a>}
          {place.source_checked_at && <p className="text-xs leading-6 text-bluegray">来源检查：{place.source_checked_at}，不代表当天开放核验。</p>}
        </article>)}
      </div>
    </details>
    <div className="mt-5 rounded-lg border border-line bg-surface p-4">
      <h3 className="font-semibold">路线推荐</h3><p className="mt-2 text-xs leading-6 text-bluegray">当前使用确定性规则，无模型调用。只推荐系统已定义的合法路线；未知时间与步行距离不会估造。</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">可用时间<select aria-label="可用时间" className="input mt-2" value={budget} onChange={(e) => setBudget(e.target.value)}><option value="">不限</option><option value="30">约半小时</option><option value="60">约一小时</option><option value="180">较充裕</option></select></label>
        <label className="text-sm">文化兴趣<select aria-label="文化兴趣" className="input mt-2" value={interest} onChange={(e) => setInterest(e.target.value)}><option value="">不限</option><option value="architecture">建筑园林</option><option value="history">历史资料</option><option value="opera">曲艺</option><option value="story">剧情探索</option></select></label>
        <button className="btn-secondary" onClick={() => void recommend()} disabled={loading}>推荐可用路线</button>
      </div>
      {recommended?.length === 0 && <p role="status" className="mt-3 text-sm">该城市暂无可用游玩路线，可先浏览地点资料。</p>}
      {recommended?.map((row) => <div key={row.route_id} className="mt-4 border-t border-line pt-3 text-sm leading-7"><strong>{row.name} · {row.preview_only ? '片段预览' : '完整主线'}</strong><ul className="list-inside list-disc">{row.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><p className="mt-1 text-xs text-bluegray">实际游览时间：{row.estimated_visit_minutes ?? '未知'} · 步行距离：{row.walking_distance_m === null ? '未知' : `${row.walking_distance_m} 米`}</p><button type="button" className="btn-ghost mt-2" onClick={() => setSelectedRouteId(row.route_id)}>在路线列表中选择</button></div>)}
    </div>
  </section>
}
