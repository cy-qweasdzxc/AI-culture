import { Link } from 'react-router-dom'
import DemoDataNotice from '@/components/DemoDataNotice'

const flow = [
  { title: '选择主题与角色', text: '每条文化路线配三位玩家角色，角色影响初始线索、NPC 态度与结局措辞。' },
  { title: '抵达点位', text: '虚拟模式在地图上点击到达；实地模式走到触发范围内自动校验。点位按剧情顺序解锁。' },
  { title: '与 NPC 对话', text: '自由提问或点选推荐选项。NPC 只讲自己领域内、且有证据支撑的内容，回答下方可展开来源。' },
  { title: '完成任务', text: '问答、密码、排序、线索组合。答案由状态机校验，奖励（线索、图鉴）不可重复领取。' },
  { title: '收集图鉴', text: '文化条目标注史实 / 争议 / 传说 / 虚构，未解锁条目只显示轮廓。' },
  { title: '抵达结局', text: '尾声的关键选择决定结局走向，旅程结束后生成由真实状态计算的学习报告。' },
]

const modes = [
  {
    name: '虚拟游览',
    text: '不需要定位权限，在地图上点击即可到达点位。完整剧情与实地一致，适合线上体验与演示。',
  },
  {
    name: '实地探索',
    text: '使用浏览器定位判断你是否真的走到了点位附近（约 120-150 米触发半径）。位置仅在触发校验时使用，默认不长期保存原始坐标。',
  },
]

export default function IntroPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="font-serif text-3xl font-bold text-ink">玩法说明</h1>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink-soft">
        《城迹入戏》把一条真实的文化路线变成可以走进去的剧本：你不是在看导览，而是在剧情里一步步把这座城问明白。
      </p>

      <section className="mt-10">
        <h2 className="font-serif text-xl font-bold text-ink">完整流程</h2>
        <ol className="mt-6 space-y-5">
          {flow.map((f, i) => (
            <li key={f.title} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-cinnabar font-serif text-sm font-bold text-cinnabar">
                {i + 1}
              </span>
              <div>
                <h3 className="font-medium text-ink">{f.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">{f.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12">
        <h2 className="font-serif text-xl font-bold text-ink">两种体验模式</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {modes.map((m) => (
            <article key={m.name} className="card p-5">
              <h3 className="font-medium text-ink">{m.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{m.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-serif text-xl font-bold text-ink">AI 与隐私边界</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-soft">
          <li>NPC 的回答来自检索增强生成（RAG）：先检索审核过的文化资料，再组织回答，并附证据编号。</li>
          <li>证据不足、问题越界或来源冲突时，NPC 使用固定话术拒答，不会编造史实。</li>
          <li>匿名体验：不需要注册，旅程保存在你的浏览器中，「设置与隐私」页可一键清除全部数据。</li>
          <li>定位遵循明示授权：只在实地模式下请求，触发判断在本地完成。</li>
        </ul>
        <div className="mt-6">
          <DemoDataNotice />
        </div>
      </section>

      <div className="mt-12">
        <Link to="/role" className="btn-primary">
          明白了，去选择角色
        </Link>
      </div>
    </div>
  )
}
