import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PersonaAvatar from '@/components/PersonaAvatar'
import { useJourney } from '@/engine/journeyStore'
import type { JourneyMode } from '@/types'
import { cn } from '@/utils/cn'

export default function RolePage() {
  const navigate = useNavigate()
  const state = useJourney((s) => s.state)
  const startJourney = useJourney((s) => s.startJourney)
  const resetJourney = useJourney((s) => s.resetJourney)
  const roles = useJourney((s) => s.roles)
  const busy = useJourney((s) => s.busy)
  const [error, setError] = useState<string | null>(null)

  const [roleId, setRoleId] = useState<string | null>(null)
  const [mode, setMode] = useState<JourneyMode>('virtual')
  const [confirming, setConfirming] = useState(false)

  const hasJourney = state !== 'CREATED'

  const doStart = async () => {
    if (!roleId) return
    try {
      setError(null)
      if (hasJourney) await resetJourney()
      await startJourney(roleId, mode)
      navigate('/map')
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建旅程失败。')
    }
  }

  const onStartClick = () => {
    if (!roleId) return
    if (hasJourney) setConfirming(true)
    else doStart()
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="font-serif text-3xl font-bold text-ink">选择你的身份</h1>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink-soft">
        角色不只是头像：它决定 NPC
        怎么称呼你、你带着什么线索上路、能听到哪些对话，甚至影响结局的措辞。 三位角色均为虚构身份。
      </p>

      <div className="mt-8 grid gap-5 md:grid-cols-3" role="radiogroup" aria-label="玩家角色">
        {roles.map((r) => {
          const selected = roleId === r.id
          return (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setRoleId(r.id)}
              className={cn(
                'card flex flex-col p-6 text-left transition-[border-color,box-shadow,transform] duration-150 active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cinnabar',
                selected ? 'border-cinnabar ring-2 ring-cinnabar/25' : 'hover:border-bronze',
              )}
            >
              <div className="flex items-center justify-between">
                <PersonaAvatar id={r.id} name={r.name} kind="user" size="xl" />
                <span className="chip text-bluegray">{r.identity}</span>
              </div>
              <h2 className="mt-4 font-serif text-xl font-bold text-ink">{r.name}</h2>
              <p className="mt-1 text-sm font-medium text-bronze">{r.tagline}</p>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-soft">{r.description}</p>
              <dl className="mt-4 space-y-2 border-t border-line pt-4 text-xs">
                <div>
                  <dt className="font-medium text-ink">初始能力</dt>
                  <dd className="mt-0.5 leading-relaxed text-bluegray">{r.perk}</dd>
                </div>
                <div>
                  <dt className="font-medium text-ink">剧情影响</dt>
                  <dd className="mt-0.5 leading-relaxed text-bluegray">{r.storyEffect}</dd>
                </div>
              </dl>
            </button>
          )
        })}
      </div>

      {/* 体验模式 */}
      <fieldset className="mt-10">
        <legend className="font-serif text-lg font-bold text-ink">体验模式</legend>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label
            className={cn(
              'card flex cursor-pointer gap-3 p-5',
              mode === 'virtual'
                ? 'border-cinnabar ring-2 ring-cinnabar/25'
                : 'hover:border-bronze',
            )}
          >
            <input
              type="radio"
              name="mode"
              className="mt-1"
              checked={mode === 'virtual'}
              onChange={() => setMode('virtual')}
            />
            <span>
              <span className="block font-medium text-ink">虚拟游览</span>
              <span className="mt-1 block text-sm leading-relaxed text-bluegray">
                不到现场也能完整体验：在地图上点击即可"到达"点位。适合比赛演示与线上体验。
              </span>
            </span>
          </label>
          <label
            className={cn(
              'card flex cursor-pointer gap-3 p-5',
              mode === 'onsite' ? 'border-cinnabar ring-2 ring-cinnabar/25' : 'hover:border-bronze',
            )}
          >
            <input
              type="radio"
              name="mode"
              className="mt-1"
              checked={mode === 'onsite'}
              onChange={() => setMode('onsite')}
            />
            <span>
              <span className="block font-medium text-ink">实地探索</span>
              <span className="mt-1 block text-sm leading-relaxed text-bluegray">
                使用浏览器定位，走到点位触发范围内才能解锁剧情。位置仅用于触发判断，可随时清除。
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      <div className="mt-10 flex items-center gap-4">
        <button
          type="button"
          className="btn-primary"
          disabled={!roleId || busy}
          onClick={onStartClick}
        >
          {busy ? '正在创建旅程…' : '创建旅程，开始体验'}
        </button>
        {!roleId ? <span className="text-sm text-bluegray">先选择一位角色</span> : null}
      </div>

      {error ? (
        <p className="mt-4 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {/* 覆盖确认 */}
      {confirming ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="restart-title"
        >
          <div className="card max-w-sm p-6">
            <h2 id="restart-title" className="font-serif text-lg font-bold text-ink">
              已有进行中的旅程
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              重新开始会清空当前旅程的进度、线索与图鉴解锁记录。
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" className="btn-ghost" onClick={() => setConfirming(false)}>
                继续原旅程
              </button>
              <button type="button" className="btn-primary" disabled={busy} onClick={doStart}>
                清空并重新开始
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
