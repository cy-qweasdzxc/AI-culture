import { Link } from 'react-router-dom'
import DemoDataNotice from '@/components/DemoDataNotice'

const flow = [
  {
    title: '选择主题与角色',
    text: '每条文化路线配三位玩家角色，角色影响初始线索、NPC 态度与结局措辞。',
  },
  {
    title: '抵达点位',
    text: '虚拟模式在地图上点击到达；实地模式走到触发范围内自动校验。点位按剧情顺序解锁。',
  },
  {
    title: '与 NPC 对话',
    text: '自由提问或点选推荐选项。NPC 只讲自己领域内、且有证据支撑的内容，回答下方可展开来源。',
  },
  {
    title: '完成任务',
    text: '问答、密码、排序、线索组合。答案由状态机校验，奖励（线索、图鉴）不可重复领取。',
  },
  { title: '收集图鉴', text: '文化条目标注史实 / 争议 / 传说 / 虚构，未解锁条目只显示轮廓。' },
  {
    title: '抵达结局',
    text: '尾声的关键选择决定结局走向，旅程结束后生成由真实状态计算的学习报告。',
  },
]

const modes = [
  {
    name: '虚拟游览',
    note: '随时开始，无需定位',
    text: '不需要定位权限，在地图上点击即可到达点位。完整剧情与实地一致，适合线上体验与演示。',
  },
  {
    name: '实地探索',
    note: '带上手机，走进城市',
    text: '使用浏览器定位判断你是否真的走到了点位附近（约 120-150 米触发半径）。位置仅在触发校验时使用，默认不长期保存原始坐标。',
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
        <a href="#ai-privacy" className="inline-flex min-h-11 items-center hover:text-ink">
          AI 与隐私
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

      <section
        id="ai-privacy"
        className="mt-10 scroll-mt-24 border-t border-line pt-8 sm:mt-12"
        aria-labelledby="ai-privacy-title"
      >
        <div className="grid gap-5 lg:grid-cols-[1fr_2fr] lg:gap-12">
          <div>
            <h2 id="ai-privacy-title" className="text-xl font-semibold text-ink">
              AI 与隐私边界
            </h2>
            <p className="mt-3 max-w-sm text-sm leading-7 text-bluegray">
              你可以查看回答的依据，也可以随时清除本次旅程。
            </p>
          </div>
          <ul className="list-disc space-y-4 pl-5 text-sm leading-7 text-ink-soft marker:text-inkgreen">
            <li>
              NPC
              的回答来自检索增强生成（RAG）：先检索已自动发布的文化资料，再组织回答，并附证据编号。
            </li>
            <li>证据不足、问题越界或来源冲突时，NPC 使用固定话术拒答，不会编造史实。</li>
            <li>
              匿名体验：不需要注册，HttpOnly Cookie
              关联服务端旅程，「设置与隐私」页可清除本次旅程数据。
            </li>
            <li>
              定位遵循明示授权：只在实地模式下读取浏览器位置，交由服务端判断距离与精度。浏览器坐标可能被模拟。
            </li>
          </ul>
        </div>
        <div className="mt-8">
          <DemoDataNotice />
        </div>
      </section>
    </div>
  )
}
