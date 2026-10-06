import { Link, NavLink, Outlet } from 'react-router-dom'
import ProgressBar from '@/components/ProgressBar'
import { roleById } from '@/data/roles'
import { selectCompletedTaskCount, useJourney } from '@/engine/journeyStore'
import { cn } from '@/utils/cn'

const tabs = [
  { to: '/map', label: '路线', icon: '⌖' },
  { to: '/clues', label: '背包', icon: '▣' },
  { to: '/codex', label: '图鉴', icon: '◈' },
  { to: '/report', label: '报告', icon: '☰' },
  { to: '/settings', label: '设置', icon: '⚙' },
]

/** 旅程区布局：顶部旅程状态 + 移动端底部五项导航（旅程守卫在路由层 RequireJourney） */
export default function JourneyLayout() {
  const roleId = useJourney((s) => s.roleId)
  const mode = useJourney((s) => s.mode)
  const done = useJourney(selectCompletedTaskCount)
  const role = roleId ? roleById.get(roleId) : undefined

  return (
    <div className="flex min-h-screen flex-col pb-16 md:pb-0">
      <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur">
        <nav className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <span className="seal" aria-hidden>
              城迹
            </span>
            <span className="hidden font-serif text-lg font-bold text-ink sm:inline">城迹入戏</span>
          </Link>
          <div className="hidden items-center gap-1 md:flex">
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-2 text-sm transition-colors',
                    isActive ? 'font-medium text-cinnabar' : 'text-ink-soft hover:text-ink',
                  )
                }
              >
                {t.label}
              </NavLink>
            ))}
          </div>
          <div className="ml-auto flex min-w-0 items-center gap-3">
            <span className="hidden shrink-0 text-xs text-bluegray lg:inline">
              {mode === 'virtual' ? '虚拟游览' : '实地探索'}
            </span>
            <div className="w-28 sm:w-40">
              <ProgressBar value={done} max={6} label="任务" />
            </div>
            <span className="shrink-0 text-sm text-ink-soft">{role ? `${role.name}` : ''}</span>
          </div>
        </nav>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      {/* 移动端底部五项导航 */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface md:hidden" aria-label="旅程导航">
        <div className="grid grid-cols-5">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                cn(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs',
                  isActive ? 'font-medium text-cinnabar' : 'text-bluegray',
                )
              }
            >
              <span aria-hidden className="text-base leading-none">
                {t.icon}
              </span>
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
