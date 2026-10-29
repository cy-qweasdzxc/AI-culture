import CitywideAttractionExplorer from '@/components/CitywideAttractionExplorer'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/services/api'
import { useJourney } from '@/engine/journeyStore'
import { safeSourceUrl } from '@/utils/sourceUrl'

type Status = 'open' | 'demo' | 'building' | 'planned'
interface City {
  id: string
  name: string
  status: Status
  theme: string
}
interface Place {
  playable?: boolean
  intro_is_demo?: boolean
  id: string
  name: string
  status: Status
  intro?: string
  note?: string
  source_url?: string
}
interface Route {
  id: string
  name: string
  status: Status
  playable: boolean
  stops: { id: string }[]
}
interface Recommendation {
  route_id: string
  name: string
  preview_only: boolean
  reasons: string[]
  estimated_visit_minutes: number | null
  walking_distance_m: number | null
}
const statusLabels: Record<Status, string> = {
  open: '已开放',
  demo: '路线节选',
  building: '筹备中',
  planned: '规划中',
}
const recommendationCopy: Record<string, string> = {
  '采用服务端已定义的点位顺序，保留线索与任务前置条件': '按顺序寻访五站，串联沿途的人物与线索。',
  '可完成现有主线与结局': '包含完整主线任务与故事结局。',
  '兴趣用于展示偏好，不改变合法任务依赖': '按兴趣探索沿途文化，主线顺序保持一致。',
  '可选简单任务；实地体验需要监护人陪同': '可选择简单难度，适合由监护人陪同体验。',
}

export default function CityExplorer() {
  const [cities, setCities] = useState<City[]>([])
  const [selected, setSelected] = useState('suzhou')
  const [places, setPlaces] = useState<Place[]>([])
  const [routes, setRoutes] = useState<Route[]>([])
  const [recommended, setRecommended] = useState<Recommendation[] | null>(null)
  const [budget, setBudget] = useState('')
  const [interest, setInterest] = useState('')
  const [error, setError] = useState('')
  const [catalogError, setCatalogError] = useState('')
  const [loading, setLoading] = useState(false)
  const [recommending, setRecommending] = useState(false)
  const [retry, setRetry] = useState(0)
  const audience = useJourney((s) => s.audienceMode ?? 'adult')
  const difficulty = useJourney((s) => s.difficulty ?? 'normal')
  useEffect(() => {
    let alive = true
    setCatalogError('')
    api
      .get<{ items: City[] }>('/cities')
      .then((data) => {
        if (alive) setCities(data.items)
      })
      .catch(() => {
        if (alive) setCatalogError('城市列表暂时无法加载，请重试。')
      })
    return () => {
      alive = false
    }
  }, [retry])
  useEffect(() => {
    let alive = true
    setLoading(true)
    setRecommended(null)
    setError('')
    setPlaces([])
    setRoutes([])
    Promise.all([
      api.get<{ items: Place[] }>(`/cities/${selected}/places`),
      api.get<{ items: Route[] }>(`/cities/${selected}/routes`),
    ])
      .then(([p, r]) => {
        if (alive) {
          setPlaces(p.items)
          setRoutes(r.items)
        }
      })
      .catch(() => {
        if (alive) setError('路线暂时无法加载，请重试。')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [selected, retry])
  async function recommend() {
    setRecommending(true)
    setError('')
    try {
      const data = await api.post<{ items: Recommendation[] }>('/routes/recommend', {
        city_id: selected,
        audience_mode: audience,
        difficulty,
        ...(budget ? { time_budget_minutes: Number(budget) } : {}),
        interests: interest ? [interest] : [],
        ...(selected === 'suzhou' && useJourney.getState().journeyId
          ? { journey_id: useJourney.getState().journeyId }
          : {}),
      })
      setRecommended(data.items.filter((route) => !route.preview_only))
    } catch {
      setError('暂时无法推荐路线，请稍后重试。')
    } finally {
      setRecommending(false)
    }
  }
  const city = cities.find((c) => c.id === selected)
  const playableRoutes = routes.filter((route) => route.playable)
  const upcomingRoutes = routes.filter((route) => !route.playable && route.status !== 'demo')
  return (
    <section
      id="city-catalog"
      className="city-catalog mt-10 scroll-mt-24 border-t border-line py-8"
      aria-labelledby="city-catalog-title"
    >
      <h2 id="city-catalog-title" className="font-serif text-2xl font-semibold">
        选择城市与路线
      </h2>
      <p className="mt-3 text-sm leading-7 text-bluegray">从一座城出发，寻找属于你的故事。</p>
      <div
        className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4"
        role="group"
        aria-label="城市选择"
      >
        {[...cities].sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open')).map((c) => (
          <button
            key={c.id}
            disabled={loading || recommending}
            className={`min-h-24 rounded-lg border p-4 text-left transition-colors disabled:opacity-60 ${c.id === selected ? 'border-cinnabar bg-cinnabar/5' : 'border-line bg-surface hover:border-inkgreen'}`}
            aria-pressed={c.id === selected}
            onClick={() => setSelected(c.id)}
          >
            <span className="block font-semibold">
              {c.name} · {statusLabels[c.status]}
            </span>
            <span className="mt-2 block text-xs leading-5 text-bluegray">{c.theme}</span>
          </button>
        ))}
      </div>
      {city && (
        <p className="mt-5 text-sm leading-7 text-ink-soft">
          {city.status === 'open'
            ? `${city.name}的故事已开启。沿五站主线游览，解锁人物、任务与结局。`
            : `${city.name}的故事正在筹备，尚未开放完整剧情。可先认识这里的文化地点。`}
        </p>
      )}
      {loading && (
        <p role="status" className="mt-3 text-sm">
          正在读取路线…
        </p>
      )}
      {(error || catalogError) && (
        <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 text-sm text-danger">
          <p>{catalogError || error}</p>
          <button
            className="btn-secondary"
            disabled={loading || recommending}
            onClick={() => setRetry((value) => value + 1)}
          >
            重新加载
          </button>
        </div>
      )}
      <div className="mt-5 grid gap-4">
        {playableRoutes.map((route) => (
          <article
            key={route.id}
            className="flex flex-col justify-between gap-5 rounded-xl border border-line bg-surface p-5 sm:flex-row sm:items-center sm:p-7"
          >
            <div>
              <p className="text-xs font-medium text-inkgreen">
                苏州经典路线 · {route.stops.length} 站
              </p>
              <h3 className="mt-2 font-serif text-xl font-semibold">{route.name}</h3>
              <p className="mt-3 max-w-prose text-sm leading-7 text-ink-soft">
                穿过水巷，走进园林，在苏州博物馆连起沿途的发现。
              </p>
            </div>
            <Link className="btn-primary shrink-0" to="/role">
              选择这条完整路线
            </Link>
          </article>
        ))}
      </div>
      <details
        className="mt-5 rounded-lg border border-line bg-surface p-4 sm:p-5"
        open={city ? city.status !== 'open' : false}
      >
        <summary className="min-h-11 cursor-pointer font-semibold leading-[44px]">
          更多文化地点与后续路线
        </summary>
        {upcomingRoutes.map((route) => (
          <div key={route.id} className="border-t border-line py-4">
            <h3 className="font-medium">
              {route.name.replace(' · 可选文化支线', '')}
              <span className="ml-3 text-xs font-normal text-bluegray">
                {statusLabels[route.status]}
              </span>
            </h3>
            <p className="mt-2 text-sm text-bluegray">新的文化故事正在准备，敬请期待。</p>
          </div>
        ))}
        <div className="grid gap-5 pt-3 sm:grid-cols-2 lg:grid-cols-3">
          {places.map((place) => (
            <article key={place.id} className="min-w-0 border-t border-line pt-4">
              <h3 className="font-semibold">{place.name}</h3>
              <p className="mt-1 text-xs text-bluegray">
                {place.playable ? '主线地点' : statusLabels[place.status]}
              </p>
              {place.intro && <p className="mt-2 text-sm leading-7">{place.intro}</p>}
              {place.intro && <p className="mt-2 text-xs text-bluegray">参考介绍 · 待核验</p>}
              {safeSourceUrl(place.source_url) && (
                <a
                  className="inline-link mt-1 text-xs"
                  href={safeSourceUrl(place.source_url)}
                  target="_blank"
                  rel="noreferrer"
                >
                  原始资料来源
                </a>
              )}
            </article>
          ))}
        </div>
      </details>
      <div className="mt-5 rounded-xl border border-line bg-surface p-5 sm:p-7">
        <h3 className="font-serif text-lg font-semibold">找到适合你的路线</h3>
        <div className="mt-4 grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="min-w-0 text-sm">
            可用时间
            <select
              aria-label="可用时间"
              className="input mt-2"
              value={budget}
              disabled={recommending}
              onChange={(e) => {
                setBudget(e.target.value)
                setRecommended(null)
              }}
            >
              <option value="">不限</option>
              <option value="30">约半小时</option>
              <option value="60">约一小时</option>
              <option value="180">较充裕</option>
            </select>
          </label>
          <label className="min-w-0 text-sm">
            文化兴趣
            <select
              aria-label="文化兴趣"
              className="input mt-2"
              value={interest}
              disabled={recommending}
              onChange={(e) => {
                setInterest(e.target.value)
                setRecommended(null)
              }}
            >
              <option value="">不限</option>
              <option value="architecture">建筑园林</option>
              <option value="history">历史资料</option>
              <option value="opera">曲艺</option>
              <option value="story">剧情探索</option>
            </select>
          </label>
          <button
            className="btn-secondary"
            onClick={() => void recommend()}
            disabled={loading || recommending}
          >
            {recommending ? '正在寻找…' : '推荐可用路线'}
          </button>
        </div>
        {recommended?.length === 0 && (
          <p role="status" className="mt-4 text-sm text-bluegray">
            该城市暂无可用游玩路线，可先浏览地点资料。
          </p>
        )}
        {recommended?.map((row) => (
          <div key={row.route_id} className="mt-5 border-t border-line pt-4 text-sm leading-7">
            <strong>{row.name}</strong>
            <ul className="mt-2 list-inside list-disc text-ink-soft">
              {row.reasons.map((reason) => (
                <li key={reason}>{recommendationCopy[reason] ?? reason}</li>
              ))}
            </ul>
            {(row.estimated_visit_minutes != null || row.walking_distance_m != null) && (
              <p className="mt-2 text-xs text-bluegray">
                {[
                  row.estimated_visit_minutes != null
                    ? `游览约 ${row.estimated_visit_minutes} 分钟`
                    : '',
                  row.walking_distance_m != null ? `步行约 ${row.walking_distance_m} 米` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
            <Link className="inline-link mt-2" to="/role">
              选择角色，开始旅程
            </Link>
          </div>
        ))}
      </div>
      {selected === 'suzhou' && <CitywideAttractionExplorer />}
    </section>
  )
}
