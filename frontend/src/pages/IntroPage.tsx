import { Link } from 'react-router-dom'

const flow = [
  {
    title: '选择主题与角色',
    text: '选择一位角色，带着自己的线索进入故事。不同身份，会遇见不同的对话。',
  },
  {
    title: '抵达点位',
    text: '沿着平江路、耦园、狮子林、拙政园走向苏州博物馆，五站按故事顺序逐一开启。线上点击到达，实地则在附近使用定位。',
  },
  {
    title: '与城中人交谈',
    text: '与老茶客、园林手艺人和青年馆员交谈。可以自由提问，也可以选择感兴趣的话题；回答中的资料来源可随时展开。',
  },
  {
    title: '完成任务',
    text: '解开六道主线谜题，串起沿途线索。想再走深一些，还能尝试十五道自选挑战与八项可选探索；选做内容不会影响主线推进。',
  },
  { title: '收集图鉴', text: '文化条目标注史实 / 争议 / 传说 / 虚构，未解锁条目只显示轮廓。' },
  {
    title: '抵达结局',
    text: '在尾声留下你的选择，走向属于自己的结局。体验报告会记录沿途的任务与发现；结束后仍可回顾这段旅程。',
  },
]

const modes = [
  {
    name: '虚拟游览',
    note: '随时开始，无需定位',
    text: '不需要定位权限，在地图上点击即可到达点位。完整体验人物对话、解谜与结局。',
  },
  {
    name: '实地探索',
    note: '带上手机，走进城市',
    text: '走到点位附近后，使用定位开启故事。出发前请了解场馆预约及开放安排，沿途注意通行安全。',
  },
]

export default function IntroPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <header className="max-w-3xl">
        <h1 className="font-serif text-3xl font-bold text-ink sm:text-4xl">玩法说明</h1>
        <p className="mt-4 max-w-prose text-base leading-8 text-ink-soft">
          《城迹入戏》把一条真实的文化路线变成可以走进去的剧本：你不是在看导览，而是在剧情里一步步把这座城问明白。
        </p>
      </header>
      <nav
        aria-label="本页内容"
        className="mt-7 flex flex-wrap gap-x-6 border-b border-line text-sm text-ink-soft"
      >
        <a
          href="#journey-flow"
          className="inline-flex min-h-11 items-center border-b-2 border-inkgreen font-medium text-inkgreen hover:text-ink"
        >
          完整流程
        </a>
        <a href="#experience-modes" className="inline-flex min-h-11 items-center hover:text-ink">
          体验模式
        </a>
      </nav>

      <div className="mt-9 grid items-start gap-10 lg:grid-cols-[1.3fr_1fr] lg:gap-16">
        <section id="journey-flow" className="scroll-mt-24" aria-labelledby="journey-flow-title">
          <h2 id="journey-flow-title" className="text-xl font-semibold text-ink">
            完整流程
          </h2>
          <ol className="mt-5 divide-y divide-line">
            {flow.map((f, i) => (
              <li key={f.title} className="flex gap-4 py-5 first:pt-0 sm:gap-5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-paper-deep text-sm font-medium tabular-nums text-inkgreen">
                  {i + 1}
                </span>
                <div className="min-w-0 pt-0.5">
                  <h3 className="text-base font-semibold text-ink">{f.title}</h3>
                  <p className="mt-2 max-w-prose text-sm leading-7 text-ink-soft">{f.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section
          id="experience-modes"
          className="scroll-mt-24 rounded-xl border border-line bg-surface p-6 sm:p-7"
          aria-labelledby="experience-modes-title"
        >
          <h2 id="experience-modes-title" className="text-xl font-semibold text-ink">
            两种体验模式
          </h2>
          <p className="mt-2 text-sm leading-7 text-bluegray">同一段故事，选择适合你的出发方式。</p>
          <div className="mt-6 divide-y divide-line">
            {modes.map((m) => (
              <article key={m.name} className="py-6 first:pt-0 last:pb-0">
                <h3 className="text-base font-semibold text-ink">{m.name}</h3>
                <p className="mt-1 text-xs font-medium text-inkgreen">{m.note}</p>
                <p className="mt-3 text-sm leading-7 text-ink-soft">{m.text}</p>
              </article>
            ))}
          </div>
          <Link to="/role" className="btn-primary mt-7 w-full">
            明白了，去选择角色
          </Link>
        </section>
      </div>
    </div>
  )
}
