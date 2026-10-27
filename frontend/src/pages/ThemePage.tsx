import ResilientImage from '@/components/ResilientImage'
import { Link } from 'react-router-dom'
import DemoDataNotice from '@/components/DemoDataNotice'
import CityExplorer from '@/components/CityExplorer'
import { publicRouteStops } from '@/data/publicRoute'
import { useJourney } from '@/engine/journeyStore'

const routeScenes = [
  { image: 'pingjiang', detail: '从水巷街市出发' },
  { image: 'ouyuan', detail: '走进一座园林' },
  { image: 'shizilin', detail: '寻访叠石与造园' },
  { image: 'zhuozhengyuan', detail: '读懂园中山水' },
  { image: 'subo', detail: '在当代回望苏州' },
]

export default function ThemePage() {
  const demoTheme = useJourney((s) => s.themes[0])
  if (!demoTheme)
    return (
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <h1 className="font-serif text-3xl font-bold text-ink">文化路线</h1>
        <p className="mt-4 text-sm text-bluegray">暂无已发布主题。</p>
        <Link to="/" className="btn-secondary mt-6">
          返回首页
        </Link>
      </div>
    )
  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <div className="grid items-center gap-8 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
        <header>
          <p className="flex items-center gap-2 text-sm text-bluegray">
            <span>{demoTheme.city}</span>
            <span aria-hidden className="h-1 w-1 rounded-full bg-bluegray/60" />
            <span>{demoTheme.district}</span>
          </p>
          <h1 className="mt-4 font-serif text-3xl font-bold leading-snug text-ink sm:text-4xl">
            {demoTheme.name}
          </h1>
          <p
            className="mt-5 max-w-prose text-base leading-8 text-ink-soft"
            style={{ textWrap: 'pretty' }}
          >
            {demoTheme.description}
          </p>
          <dl className="mt-7 flex flex-wrap gap-x-7 gap-y-4 border-y border-line py-5 text-sm">
            <div className="flex items-baseline gap-2">
              <dt className="text-bluegray">点位</dt>
              <dd className="font-semibold text-ink">{publicRouteStops.length} 个</dd>
            </div>
            <div className="flex items-baseline gap-2">
              <dt className="text-bluegray">预计</dt>
              <dd className="font-semibold text-ink">待现场核验</dd>
            </div>
            <div className="flex items-baseline gap-2">
              <dt className="text-bluegray">步行</dt>
              <dd className="font-semibold text-ink">待道路规划</dd>
            </div>
          </dl>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link to="/role" className="btn-primary">
              选择角色，走这条路
            </Link>
            <Link to="/intro" className="btn-secondary">
              先看玩法说明
            </Link>
          </div>
        </header>
        <figure className="overflow-hidden rounded-xl bg-paper-deep">
          <div className="h-64 overflow-hidden sm:h-[380px] lg:h-[420px]">
            <ResilientImage
              src="/assets/scenes/pingjiang.webp"
              alt="平江路沿河茶馆、石桥与水巷的场景插画"
              width="1920"
              height="1080"
              className="h-full w-full scale-[1.16] object-cover"
            />
          </div>
          <figcaption className="flex items-center justify-between gap-3 border-t border-line bg-surface px-5 py-3 text-xs text-bluegray">
            <span>故事从平江路开始</span>
            <span>艺术化示意</span>
          </figcaption>
        </figure>
      </div>

      <section
        className="mt-12 border-t border-line pt-8 sm:mt-16"
        aria-labelledby="route-stops-title"
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_2fr] lg:gap-12">
          <div>
            <h2 id="route-stops-title" className="text-xl font-semibold text-ink">
              路线上的五站
            </h2>
            <p className="mt-3 max-w-sm text-sm leading-7 text-ink-soft">
              开始旅程后，按剧情顺序解锁点位详情与任务。
            </p>
            <p className="mt-4 text-xs leading-6 text-bluegray">
              以下为公开路线预览，完整故事将在途中展开。
            </p>
          </div>
          <ol className="divide-y divide-line border-y border-line">
            {publicRouteStops.map((name, i) => (
              <li
                key={name}
                id={routeScenes[i]?.image}
                className="flex scroll-mt-28 items-center gap-4 py-4 sm:gap-5"
              >
                <span className="w-5 shrink-0 text-sm tabular-nums text-bluegray">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <ResilientImage
                  src={`/assets/scenes/${routeScenes[i]?.image ?? 'pingjiang'}.webp`}
                  alt={`${name}艺术化示意`}
                  loading="lazy"
                  className="h-16 w-20 shrink-0 rounded-md object-cover sm:h-20 sm:w-28"
                />
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-ink">{name}</h3>
                  <p className="mt-1 text-sm text-bluegray">{routeScenes[i]?.detail}</p>
                </div>
                {i === publicRouteStops.length - 1 ? (
                  <span className="ml-auto hidden text-xs text-bluegray sm:block">终点</span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </section>
      <div className="mt-8">
        <CityExplorer />
        <DemoDataNotice />
      </div>
    </div>
  )
}
