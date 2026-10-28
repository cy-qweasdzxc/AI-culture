import ResilientImage from '@/components/ResilientImage'
import { Link } from 'react-router-dom'
import Icon from '@/components/Icon'
import PersonaAvatar from '@/components/PersonaAvatar'
import CityExplorer from '@/components/CityExplorer'
import { publicRouteStops } from '@/data/publicRoute'
import { useJourney } from '@/engine/journeyStore'

const destinations = [
  { id: 'pingjiang', note: '水巷里的城市记忆' },
  { id: 'ouyuan', note: '一座园，两个人的故事' },
  { id: 'shizilin', note: '在湖石之间寻路' },
  { id: 'zhuozhengyuan', note: '一池荷风，半卷园史' },
  { id: 'subo', note: '从古典园林走向当代' },
]
const encounters = [
  {
    id: 'zhou-bo',
    name: '周伯',
    identity: '平江路的老茶客',
    text: '巷子里的旧事，不妨坐下来听他说说。',
  },
  {
    id: 'a-heng',
    name: '阿蘅',
    identity: '守着园子的手艺人',
    text: '跟着她的目光，读一块石、一扇窗。',
  },
  {
    id: 'xiao-shen',
    name: '小沈',
    identity: '苏州博物馆的青年馆员',
    text: '关于一座新馆，她总有资料可以翻给你看。',
  },
]

export default function HomePage() {
  const state = useJourney((s) => s.state)
  const demoTheme = useJourney((s) => s.themes[0])
  const inJourney = state !== 'CREATED'
  if (!demoTheme)
    return (
      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <h1 className="font-serif text-3xl font-bold text-ink">新的故事正在准备</h1>
        <p className="mt-4 text-sm text-ink-soft">暂无已发布主题，请稍后回来看看。</p>
      </section>
    )

  return (
    <div className="home-page">
      <section className="home-hero page-width">
        <div className="home-hero-copy">
          <p className="mb-6 flex items-center gap-2 text-sm text-ink-soft">
            <Icon name="pin" className="h-4 w-4 text-cinnabar" />
            {demoTheme.city} · {demoTheme.subtitle}
          </p>
          <h1 className="home-title font-serif font-bold text-ink">
            把一座城，
            <br />
            走成一出戏。
          </h1>
          <p className="mt-6 max-w-[25rem] text-[15px] leading-8 text-ink-soft">
            从一条水巷出发，以自己的身份走进故事。
            <br className="hidden sm:block" />
            与城中人交谈，在园林间寻线索，
            <br className="hidden sm:block" />
            把沿途的文化，留在你的旅程里。
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to={inJourney ? '/map' : '/role'} className="btn-primary gap-5 px-6">
              {inJourney ? '继续旅程' : '开始体验'}
              <Icon name="arrow" className="h-4 w-4" />
            </Link>
            <Link to="/intro" className="btn-ghost">
              查看玩法说明
              <Icon name="chevron" className="h-4 w-4" />
            </Link>
          </div>
          <p className="mt-5 text-xs text-bluegray">无需注册 · 支持线上游览与实地探索</p>
        </div>
        <Link to="/theme" className="home-hero-scene group" aria-label="了解平江寻梦文化路线">
          <ResilientImage
            src="/assets/scenes/pingjiang.webp"
            alt="平江水巷的石桥、柳影与临河茶馆艺术化示意，非实景摄影"
            {...{ fetchpriority: 'high' }}
            width="1920"
            height="1080"
          />
          <span className="home-scene-label">
            <span className="h-1.5 w-1.5 rounded-full bg-cinnabar" />
            本期故事 · {demoTheme.name}
          </span>
          <div className="home-scene-caption">
            <div>
              <span className="text-xs text-white/85">平江路 · 旅程起点</span>
              <p className="mt-2 font-serif text-2xl font-medium">沿着水巷，走进苏州。</p>
            </div>
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/50 transition-colors group-hover:bg-white/20">
              <Icon name="arrow" />
            </span>
          </div>
        </Link>
      </section>
      <div className="page-width">
        <div className="home-route-meta">
          <div className="flex items-center gap-3">
            <span className="text-xs text-bluegray">当前开放</span>
            <strong className="font-medium text-ink">{demoTheme.name}</strong>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-xs text-ink-soft">
            <span className="flex items-center gap-2">
              <Icon name="pin" className="h-4 w-4" />
              {publicRouteStops.length} 处文化点位
            </span>
          </div>
        </div>
      </div>
      <section className="page-width home-destinations">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-serif text-[28px] font-bold leading-snug text-ink">
              五站之间，看见一座城
            </h2>
            <p className="mt-3 text-sm text-ink-soft">从河街相邻的老巷，走到以石为绘的新馆。</p>
          </div>
          <Link to="/theme" className="inline-link">
            查看完整路线
            <Icon name="arrow" className="h-4 w-4" />
          </Link>
        </div>
        <ol className="destination-grid">
          {destinations.map((place, index) => (
            <li key={place.id}>
              <Link to={`/theme#${place.id}`} className="destination-link group">
                <div className="destination-image">
                  <ResilientImage
                    src={`/assets/scenes/${place.id}.webp`}
                    alt={`${publicRouteStops[index]}艺术化示意`}
                    loading="lazy"
                    width="1920"
                    height="1080"
                  />
                  <span className="destination-number">{String(index + 1).padStart(2, '0')}</span>
                </div>
                <h3 className="mt-4 flex items-center justify-between text-[15px] font-semibold text-ink">
                  {publicRouteStops[index]}
                  <Icon
                    name="arrow"
                    className="h-4 w-4 text-bluegray transition-transform group-hover:translate-x-1"
                  />
                </h3>
                <p className="mt-2 text-xs leading-6 text-bluegray">{place.note}</p>
              </Link>
            </li>
          ))}
        </ol>
      </section>
      <section className="home-encounters">
        <div className="page-width grid gap-10 py-12 md:grid-cols-[1fr_1.25fr] md:gap-20 md:py-16">
          <div className="self-center">
            <h2 className="font-serif text-[28px] font-bold leading-relaxed text-ink">
              风景之外，
              <br />
              还有等你开口的人。
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-7 text-ink-soft">
              以学者、闲客或见习园主的身份出发。你的角色与提问，将打开不同的对话和初始线索。
            </p>
            <Link to="/role" className="inline-link mt-6">
              选择你的故事身份
              <Icon name="arrow" className="h-4 w-4" />
            </Link>
          </div>
          <ul className="divide-y divide-line">
            {encounters.map((person) => (
              <li key={person.id} className="flex items-center gap-5 py-5 first:pt-0 last:pb-0">
                <PersonaAvatar id={person.id} name={person.name} size="lg" />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <strong className="text-base font-semibold text-ink">{person.name}</strong>
                    <span className="text-xs text-ink-soft">{person.identity}</span>
                  </p>
                  <p className="mt-2 text-xs leading-6 text-bluegray">{person.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <div className="page-width"><CityExplorer /></div>

    </div>
  )
}
