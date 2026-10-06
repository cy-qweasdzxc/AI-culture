import { Link } from 'react-router-dom'
import SealMark from '@/components/SealMark'
import { demoTheme, spots } from '@/data/theme'
import { useJourney } from '@/engine/journeyStore'

/** 路线卷轴：首页首屏的主视觉（写意的平江路线） */
function RouteScroll() {
  return (
    <svg viewBox="0 0 420 520" className="h-auto w-full max-w-md" role="img" aria-label="平江寻梦路线卷轴">
      {/* 卷轴边框 */}
      <rect x="8" y="8" width="404" height="504" rx="10" fill="none" stroke="var(--bronze)" strokeWidth="1.5" opacity="0.5" />
      <rect x="18" y="18" width="384" height="484" rx="6" fill="none" stroke="var(--bronze)" strokeWidth="0.75" opacity="0.35" />
      {/* 水巷 */}
      <path
        d="M 110 480 C 170 400, 120 330, 190 260 S 230 140, 210 50"
        fill="none"
        stroke="oklch(0.72 0.05 230)"
        strokeWidth="26"
        strokeLinecap="round"
        opacity="0.3"
      />
      {/* 路线 */}
      <path
        d="M 120 452 C 230 420, 300 370, 260 300 S 200 220, 230 150 S 300 90, 310 60"
        fill="none"
        stroke="var(--cinnabar)"
        strokeWidth="2.5"
        strokeDasharray="5 8"
        strokeLinecap="round"
      />
      {spots.map((s, i) => {
        const pos = [
          { x: 120, y: 452 },
          { x: 262, y: 360 },
          { x: 228, y: 262 },
          { x: 232, y: 148 },
          { x: 310, y: 60 },
        ][i]
        return (
          <g key={s.id} transform={`translate(${pos.x}, ${pos.y})`}>
            <circle r="15" fill="var(--surface)" stroke="var(--cinnabar)" strokeWidth="2" />
            <text textAnchor="middle" dy="4.5" fontSize="12" fill="var(--cinnabar)" fontWeight="700" fontFamily="serif">
              {i + 1}
            </text>
            <text x="24" dy="4" fontSize="14" fill="var(--ink)" fontWeight="600">
              {s.shortName}
            </text>
          </g>
        )
      })}
      {/* 印章 */}
      <g transform="translate(60, 46)">
        <rect width="44" height="44" rx="4" fill="var(--cinnabar)" />
        <text x="22" y="20" textAnchor="middle" fontSize="15" fill="#fff" fontFamily="serif" fontWeight="700">
          平江
        </text>
        <text x="22" y="37" textAnchor="middle" fontSize="15" fill="#fff" fontFamily="serif" fontWeight="700">
          寻梦
        </text>
      </g>
    </svg>
  )
}

const capabilities = [
  {
    seal: '证据',
    title: '文化知识库与证据引用',
    text: 'NPC 的每一句文化讲述都挂在审核过的证据上：来源可查，史实、争议、传说、虚构四级标注。证据不足时，NPC 会直接拒答，不编。',
  },
  {
    seal: '角色',
    title: 'AI NPC 角色智能体',
    text: '老茶客、园艺人、馆员，三个 NPC 各有身份、性格和知识边界。周伯不讲造园工艺，馆员不谈巷弄传说，越界的问题他们会明说不知道。',
  },
  {
    seal: '触发',
    title: '位置触发与剧情状态机',
    text: '实地定位或虚拟游览双模式。剧情推进由状态机校验：顺序、前置、幂等，缺一不可。前端无法篡改进度，结局可复现。',
  },
  {
    seal: '图鉴',
    title: '文化图鉴与学习报告',
    text: '解锁的文化条目进入图鉴，标清可信等级；旅程结束后生成报告：完成率、知识得分、时间线，全部由真实旅程状态计算。',
  },
]

const steps = [
  { label: '选择角色', detail: '三种身份，不同的初始线索与 NPC 态度' },
  { label: '探索路线', detail: '五个点位，平江路走到苏州博物馆' },
  { label: '对话解谜', detail: '与 NPC 交谈找证据，解开六道谜题' },
  { label: '点亮结局', detail: '关键选择决定结局，生成学习报告' },
]

export default function HomePage() {
  const state = useJourney((s) => s.state)
  const inJourney = state !== 'CREATED'

  return (
    <div>
      {/* 首屏 */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:grid-cols-2 md:py-20">
        <div>
          <p className="text-sm font-medium tracking-wide text-bronze">{demoTheme.subtitle} · 演示原型</p>
          <h1 className="mt-3 font-serif text-4xl font-bold leading-tight text-ink md:text-5xl" style={{ textWrap: 'balance' }}>
            把一座城，
            <br />
            走成一出戏。
          </h1>
          <p className="mt-5 max-w-prose text-base leading-relaxed text-ink-soft" style={{ textWrap: 'pretty' }}>
            《城迹入戏》是 AI
            地方文化剧本游平台：你选一位角色走进真实的文化路线，与有知识边界的 NPC 交谈，靠证据解开谜题，在图鉴里留下可信的文化笔记，最终抵达属于你的结局。
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {inJourney ? (
              <Link to="/map" className="btn-primary">
                继续旅程
              </Link>
            ) : (
              <Link to="/role" className="btn-primary">
                开始体验
              </Link>
            )}
            <Link to="/intro" className="btn-secondary">
              查看玩法说明
            </Link>
          </div>
          <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-line pt-6 text-sm">
            <div>
              <dt className="text-bluegray">路线点位</dt>
              <dd className="mt-1 font-serif text-xl font-bold text-inkgreen">{spots.length} 个</dd>
            </div>
            <div>
              <dt className="text-bluegray">预计时长</dt>
              <dd className="mt-1 font-serif text-xl font-bold text-inkgreen">{demoTheme.durationMinutes} 分钟</dd>
            </div>
            <div>
              <dt className="text-bluegray">步行距离</dt>
              <dd className="mt-1 font-serif text-xl font-bold text-inkgreen">约 {demoTheme.distanceKm} 公里</dd>
            </div>
          </dl>
        </div>
        <div className="flex justify-center md:justify-end">
          <RouteScroll />
        </div>
      </section>

      {/* 核心能力：交替宽幅，避免雷同卡片网格 */}
      <section className="border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="font-serif text-2xl font-bold text-ink">这套系统凭什么可信</h2>
          <div className="mt-8 space-y-4">
            {capabilities.map((c, i) => (
              <article
                key={c.title}
                className={`card flex flex-col gap-4 p-6 sm:flex-row sm:items-start ${i % 2 === 1 ? 'sm:ml-12' : 'sm:mr-12'}`}
              >
                <SealMark text={c.seal} className="mt-0.5" />
                <div>
                  <h3 className="font-serif text-lg font-bold text-inkgreen">{c.title}</h3>
                  <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-soft">{c.text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 体验流程（真实的先后序列） */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="font-serif text-2xl font-bold text-ink">四步走完这条路</h2>
        <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.label} className="relative border-t-2 border-cinnabar pt-4">
              <span className="font-serif text-3xl font-bold text-cinnabar">{i + 1}</span>
              <h3 className="mt-1 font-medium text-ink">{s.label}</h3>
              <p className="mt-1 text-sm text-bluegray">{s.detail}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10">
          <Link to="/role" className="btn-primary">
            现在出发
          </Link>
        </div>
      </section>

      {/* 真实性说明 */}
      <section className="border-t border-line bg-paper-deep">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <h2 className="font-serif text-lg font-bold text-ink">资料来源与 AI 边界</h2>
          <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink-soft">
            平台内的文化内容分四级标注：可靠史实、争议观点、民间传说、艺术化虚构。NPC
            只讲述审核过的内容，回答附证据来源；超出其知识边界或证据不足时，会明确告诉你"现有资料无法确认"。当前为演示数据，正式版本所有内容须经人工审核后入库。
          </p>
          <Link to="/intro" className="mt-4 inline-block text-sm font-medium text-cinnabar underline underline-offset-4">
            阅读完整的玩法与隐私说明
          </Link>
        </div>
      </section>
    </div>
  )
}
