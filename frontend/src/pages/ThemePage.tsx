import { Link } from 'react-router-dom'
import DemoDataNotice from '@/components/DemoDataNotice'
import SealMark from '@/components/SealMark'
import { publicRouteStops } from '@/data/publicRoute'
import { useJourney } from '@/engine/journeyStore'

export default function ThemePage() {
  const demoTheme = useJourney((s) => s.themes[0])
  if (!demoTheme) return <p className="px-4 py-16 text-center text-bluegray">暂无已发布主题。</p>
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <p className="text-sm font-medium text-bronze">
        {demoTheme.city} · {demoTheme.district}
      </p>
      <h1 className="mt-2 font-serif text-3xl font-bold text-ink">{demoTheme.name}</h1>
      <p
        className="mt-4 max-w-prose text-base leading-relaxed text-ink-soft"
        style={{ textWrap: 'pretty' }}
      >
        {demoTheme.description}
      </p>
      <dl className="mt-6 flex flex-wrap gap-6 text-sm text-ink-soft">
        <div>
          点位 <strong className="text-inkgreen">{publicRouteStops.length} 个</strong>
        </div>
        <div>
          预计 <strong className="text-inkgreen">{demoTheme.durationMinutes} 分钟</strong>
        </div>
        <div>
          步行 <strong className="text-inkgreen">约 {demoTheme.distanceKm} 公里</strong>
        </div>
      </dl>

      <section className="mt-12">
        <h2 className="font-serif text-xl font-bold text-ink">路线上的五站</h2>
        <ol className="mt-6 space-y-0">
          {publicRouteStops.map((name, i) => (
            <li key={name} className="relative flex gap-4 pb-8">
              {i < publicRouteStops.length - 1 ? (
                <span className="absolute left-[17px] top-10 h-full w-0.5 bg-line" aria-hidden />
              ) : null}
              <span className="z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-cinnabar bg-surface font-serif text-sm font-bold text-cinnabar">
                {i + 1}
              </span>
              <div className="card flex-1 p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-serif text-lg font-bold text-ink">{name}</h3>
                  <SealMark text={name.slice(0, 2)} />
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  开始旅程后，按剧情顺序解锁点位详情与任务。
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <DemoDataNotice />

      <div className="mt-10 flex gap-3">
        <Link to="/role" className="btn-primary">
          选择角色，走这条路
        </Link>
        <Link to="/intro" className="btn-secondary">
          先看玩法说明
        </Link>
      </div>
    </div>
  )
}
