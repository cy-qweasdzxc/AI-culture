import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import Icon from '@/components/Icon'
import { useJourney } from '@/engine/journeyStore'
import { cn } from '@/utils/cn'

const navItems = [
  { to: '/', label: '首页', end: true },
  { to: '/theme', label: '文化主题' },
  { to: '/intro', label: '玩法说明' },
  { to: '/codex', label: '文化图鉴' },
]

export default function PublicLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname, hash } = useLocation()
  const inJourney = useJourney((s) => s.state !== 'CREATED')
  useEffect(() => {
    setMenuOpen(false)
    if (!hash) window.scrollTo({ top: 0, behavior: 'instant' })
    else requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView())
  }, [pathname, hash])

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main-content" className="skip-link">
        跳至主要内容
      </a>
      <header className="public-header sticky top-0 z-40 border-b border-line bg-surface">
        <div className="page-width flex h-[76px] items-center justify-between gap-4">
          <Link to="/" className="brand-link" aria-label="城迹入戏首页">
            <span className="brand-mark" aria-hidden>
              城迹
            </span>
            <span>
              <span className="block font-serif text-xl font-bold tracking-[0.08em] text-ink">
                城迹入戏
              </span>
              <span className="mt-0.5 block text-[10px] tracking-[0.14em] text-bluegray">
                在城市里，遇见故事
              </span>
            </span>
          </Link>
          <nav className="hidden items-center gap-6 md:flex" aria-label="主要导航">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => cn('public-nav-link', isActive && 'is-active')}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link to={inJourney ? '/map' : '/role'} className="btn-primary gap-4 px-4 sm:px-5">
              {inJourney ? '继续旅程' : '开始体验'}
              <Icon name="arrow" className="hidden h-4 w-4 sm:block" />
            </Link>
            <button
              type="button"
              className="btn-ghost w-11 px-0 md:hidden"
              aria-label={menuOpen ? '关闭导航菜单' : '打开导航菜单'}
              aria-expanded={menuOpen}
              aria-controls="mobile-public-nav"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <Icon name={menuOpen ? 'close' : 'menu'} />
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav
            id="mobile-public-nav"
            className="grid grid-cols-2 gap-1 border-t border-line bg-surface px-5 py-3 md:hidden"
            aria-label="移动端主要导航"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setMenuOpen(false)
            }}
          >
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-4 py-3 text-sm',
                    isActive
                      ? 'bg-cinnabar/5 font-medium text-cinnabar'
                      : 'text-ink-soft hover:bg-paper-deep',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      <main id="main-content" className="flex-1" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="border-t border-line bg-surface">
        <div className="page-width grid gap-6 py-8 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="font-serif text-base font-bold text-ink">
              城迹入戏
              <span className="ml-3 font-sans text-xs font-normal text-ink-soft">
                让文化，成为沿途的故事。
              </span>
            </p>
            <p className="mt-3 max-w-xl text-xs leading-6 text-bluegray">
              AI 地方文化剧本游 · 演示原型。文化内容分级标注，回答附证据引用，资料不足时明确告知。
            </p>
          </div>
          <div className="flex flex-col gap-3 text-xs text-bluegray">
            <div className="flex gap-5">
              <Link to="/intro" className="footer-link">
                体验说明
              </Link>
              <Link to="/settings" className="footer-link">
                设置与隐私
              </Link>
              <Link to="/demo" className="footer-link">
                演示入口
              </Link>
            </div>
            <p>位置仅用于点位触发，旅程数据可随时清除。</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
