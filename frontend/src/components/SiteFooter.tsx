import { Link } from 'react-router-dom'

const notices = [
  {
    title: '内容与来源',
    text: '文化内容区分史实、争议、传说与虚构，类别不代表审核结论。参考资料的核验状态及原始来源可在详情中查看；待核验资料仅供阅读，不作为文化问答的事实依据。',
  },
  {
    title: '人物与影像',
    text: '故事人物、情节与道具为创作设定。水巷与园林插画用于营造故事场景，实景照片另有标注，署名、来源与许可见图片详情。',
  },
  {
    title: '对话与旅程',
    text: '文化问答依据有效的已审核资料组织回答，资料不足时会明确告知。剧情引导与预设回复会单独标注。任务积分和体验报告记录本次游玩过程，不作为学习能力评价。',
  },
  {
    title: '出行与隐私',
    text: '地图点位及连线用于路线展示，部分坐标为近似位置，不作为入口或道路导航。开放时间、预约与通行安排请以场馆公告为准。无需注册；实地探索经授权使用定位，旅程记录可在设置中清除。儿童实地探索请由监护人陪同。',
  },
]

export default function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface" aria-label="网站页脚">
      <div className="page-width py-7 sm:py-9">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <Link to="/" className="brand-link self-start" aria-label="城迹入戏首页">
            <span className="brand-mark" aria-hidden>
              城迹
            </span>
            <span>
              <span className="block font-serif text-base font-bold text-ink">城迹入戏</span>
              <span className="mt-1 block text-xs text-bluegray">让文化，成为沿途的故事。</span>
            </span>
          </Link>
          <nav className="flex flex-wrap gap-x-6 text-xs text-bluegray" aria-label="页脚导航">
            <Link to="/theme" className="footer-link">
              文化路线
            </Link>
            <Link to="/intro" className="footer-link">
              玩法说明
            </Link>
            <Link to="/settings" className="footer-link">
              设置与隐私
            </Link>
          </nav>
        </div>
        <details className="mt-5 border-t border-line pt-2 text-xs text-bluegray">
          <summary className="min-h-11 cursor-pointer py-3 font-medium text-ink-soft">
            内容、出行与隐私说明
          </summary>
          <div className="grid gap-x-10 gap-y-5 pb-3 pt-2 sm:grid-cols-2">
            {notices.map((notice) => (
              <section key={notice.title}>
                <h2 className="font-semibold text-ink-soft">{notice.title}</h2>
                <p className="mt-2 max-w-prose leading-6">{notice.text}</p>
              </section>
            ))}
          </div>
        </details>
      </div>
    </footer>
  )
}
