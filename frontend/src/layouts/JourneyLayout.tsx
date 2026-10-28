import { useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import Icon from '@/components/Icon'
import PersonaAvatar from '@/components/PersonaAvatar'
import ProgressBar from '@/components/ProgressBar'
import JourneyTimeline from '@/components/JourneyTimeline'
import SiteFooter from '@/components/SiteFooter'
import { selectCompletedTaskCount, useJourney } from '@/engine/journeyStore'
import { cn } from '@/utils/cn'

const tabs = [
  { to: '/map', label: '路线', icon: 'map' },
  { to: '/clues', label: '背包', icon: 'backpack' },
  { to: '/codex', label: '图鉴', icon: 'book' },
  { to: '/report', label: '报告', icon: 'report' },
  { to: '/settings', label: '设置', icon: 'settings' },
] as const

export default function JourneyLayout() {
  const { pathname } = useLocation()
  const roleId = useJourney((s) => s.roleId)
  const mode = useJourney((s) => s.mode)
  const done = useJourney(selectCompletedTaskCount)
  const roles = useJourney((s) => s.roles)
  const totalTasks = useJourney((s) => s.report?.totalTaskCount ?? 6)
  const role = roles.find((item) => item.id === roleId)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])
  useEffect(() => {
    const viewport = window.visualViewport
    const update = () => {
      document.documentElement.style.setProperty('--visual-viewport-height', `${viewport?.height ?? window.innerHeight}px`)
      document.documentElement.dataset.compactViewport = String((viewport?.height ?? window.innerHeight) < 650)
    }
    update()
    viewport?.addEventListener('resize', update)
    window.addEventListener('resize', update)
    return () => {
      viewport?.removeEventListener('resize', update)
      window.removeEventListener('resize', update)
      document.documentElement.style.removeProperty('--visual-viewport-height')
      delete document.documentElement.dataset.compactViewport
    }
  }, [])

  return (
    <div className="journey-shell flex min-h-screen flex-col">
      <a href="#main-content" className="skip-link">
        跳至主要内容
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-surface">
        <div className="page-width flex h-16 items-center gap-4 md:h-[76px]">
          <Link to="/" className="brand-link shrink-0" aria-label="城迹入戏首页">
            <span className="brand-mark" aria-hidden>
              城迹
            </span>
            <span className="hidden font-serif text-lg font-bold tracking-wider text-ink lg:inline">
              城迹入戏
            </span>
          </Link>
          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="旅程主导航">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) => cn('journey-nav-link', isActive && 'is-active')}
              >
                <Icon name={tab.icon} className="h-[18px] w-[18px]" />
                {tab.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-4">
            <div className="w-28 sm:w-36">
              <ProgressBar value={done} max={totalTasks} label="任务" />
            </div>
            {role && (
              <div className="flex items-center gap-2.5 border-l border-line pl-4">
                <PersonaAvatar id={role.id} name={role.name} kind="user" size="sm" />
                <div className="hidden sm:block">
                  <p className="max-w-28 truncate text-xs font-medium text-ink">{role.name}</p>
                  <p className="mt-1 text-[10px] text-bluegray">
                    {mode === 'virtual' ? '虚拟游览' : '实地探索'}
                  </p>
                </div>
              </div>
            )}
            {!role && <span className="text-xs text-bluegray">文化探索手记</span>}
          </div>
        </div>
      </header>
      <JourneyTimeline />
      <main id="main-content" className="flex-1" tabIndex={-1}>
        <Outlet />
      </main>
      <SiteFooter />
      <nav
        className="journey-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface md:hidden"
        aria-label="旅程导航"
      >
        <div className="grid grid-cols-5">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                cn(
                  'flex min-h-[64px] flex-col items-center justify-center gap-1.5 text-[11px] transition-colors',
                  isActive ? 'font-semibold text-cinnabar' : 'text-bluegray',
                )
              }
            >
              <Icon name={tab.icon} className="h-5 w-5" />
              {tab.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
