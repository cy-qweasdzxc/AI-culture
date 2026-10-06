import { Link, NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/utils/cn'

const navItems = [
  { to: '/', label: '首页', end: true },
  { to: '/intro', label: '玩法说明' },
  { to: '/theme', label: '文化主题' },
  { to: '/codex', label: '文化图鉴' },
]

/** 公共区布局 */
export default function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur">
        <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="seal" aria-hidden>
              城迹
            </span>
            <span className="font-serif text-lg font-bold text-ink">城迹入戏</span>
          </Link>
          <div className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-2 text-sm transition-colors',
                    isActive ? 'font-medium text-cinnabar' : 'text-ink-soft hover:text-ink',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
            <Link to="/role" className="btn-primary ml-3 min-h-9 px-4 py-1.5">
              开始体验
            </Link>
          </div>
          <Link to="/role" className="btn-primary min-h-9 px-4 py-1.5 md:hidden">
            开始体验
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-line bg-paper-deep">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs leading-relaxed text-bluegray">
          <p>
            城迹入戏 · AI 地方文化剧本游平台（演示原型）。文化内容按史实 / 争议 / 传说 / 虚构四级标注，AI
            回答附证据引用，证据不足时拒答。
          </p>
          <p className="mt-1">定位信息仅用于点位触发，可在「设置与隐私」中随时清除全部旅程数据。</p>
        </div>
      </footer>
    </div>
  )
}
