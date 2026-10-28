import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PersonaAvatar from '@/components/PersonaAvatar'
import { useJourney } from '@/engine/journeyStore'
import type { AudienceMode, DifficultyLevel, JourneyMode } from '@/types'
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
  const [audience, setAudience] = useState<AudienceMode>('adult')
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('normal')
  const [confirming, setConfirming] = useState(false)
  const [starting, setStarting] = useState(false)
  const restartDialogRef = useRef<HTMLDialogElement>(null)
  const startButtonRef = useRef<HTMLButtonElement>(null)
  const startPendingRef = useRef(false)

  const hasJourney = state !== 'CREATED'
  const selectedRole = roles.find((role) => role.id === roleId)
  const submitting = busy || starting

  useEffect(() => {
    const dialog = restartDialogRef.current
    if (!dialog) return
    if (confirming && !dialog.open) dialog.showModal()
    else if (!confirming && dialog.open) dialog.close()
  }, [confirming])

  const doStart = async () => {
    if (!roleId || busy || startPendingRef.current) return
    startPendingRef.current = true
    setStarting(true)
    try {
      setError(null)
      if (hasJourney) await resetJourney()
      await startJourney(roleId, mode, { audience_mode: audience, difficulty, route_id: 'suzhou-classic' })
      navigate('/map')
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建旅程失败。')
    } finally {
      startPendingRef.current = false
      setStarting(false)
    }
  }

  const onStartClick = () => {
    if (!roleId || submitting || startPendingRef.current) return
    if (hasJourney) {
      setError(null)
      setConfirming(true)
    } else doStart()
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <header className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:gap-8">
        <div>
          <h1 className="font-serif text-3xl font-bold text-ink sm:text-4xl">选择你的身份</h1>
          <p className="mt-4 max-w-prose text-sm leading-7 text-ink-soft">
            角色不只是头像：它决定 NPC
            怎么称呼你、你带着什么线索上路、能听到哪些对话，甚至影响结局的措辞。
          </p>
        </div>
        <Link to="/theme" className="btn-ghost shrink-0 !px-0 sm:!px-3">
          返回路线详情
        </Link>
      </header>

      <fieldset className="mt-6 grid gap-4 rounded-lg border border-line bg-surface p-4 sm:grid-cols-2">
        <legend className="px-2 font-semibold">适合人群与难度</legend>
        <label className="text-sm">表达模式
          <select aria-label="适合人群" className="input mt-2" value={audience} onChange={(event) => {
            const value = event.target.value as AudienceMode
            setAudience(value); setDifficulty(value === 'child' ? 'easy' : 'normal')
          }}>
            <option value="child">儿童 · 短句与安全提示</option>
            <option value="student">学生 · 证据与推理</option>
            <option value="adult">成人 · 完整背景</option>
          </select>
        </label>
        <label className="text-sm">任务难度
          <select aria-label="任务难度" className="input mt-2" value={difficulty} onChange={(event) => setDifficulty(event.target.value as DifficultyLevel)}>
            <option value="easy">简单 · 更多提示</option><option value="normal">标准</option><option value="advanced">深入 · 减少提示</option>
          </select>
        </label>
        <p className="text-xs leading-6 text-bluegray sm:col-span-2">选择适合你的表达方式与挑战难度。开始答题后，难度将固定。</p>
      </fieldset>
      <div className="mt-8 grid gap-5 md:grid-cols-3" role="radiogroup" aria-label="玩家角色">
        {roles.map((r, index) => {
          const selected = roleId === r.id
          return (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected || (!roleId && index === 0) ? 0 : -1}
              onClick={() => setRoleId(r.id)}
              onKeyDown={(event) => {
                const direction = ['ArrowRight', 'ArrowDown'].includes(event.key)
                  ? 1
                  : ['ArrowLeft', 'ArrowUp'].includes(event.key)
                    ? -1
                    : 0
                if (!direction) return
                event.preventDefault()
                const nextIndex = (index + direction + roles.length) % roles.length
                setRoleId(roles[nextIndex].id)
                const roleButtons =
                  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                    '[role="radio"]',
                  )
                roleButtons?.[nextIndex]?.focus()
              }}
              className={cn(
                'group flex min-w-0 flex-col overflow-hidden rounded-xl border bg-surface text-left transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cinnabar',
                selected
                  ? 'border-cinnabar ring-1 ring-cinnabar'
                  : 'border-line hover:border-inkgreen/60',
              )}
            >
              <div className="relative w-full overflow-hidden bg-paper-deep">
                <PersonaAvatar
                  id={r.id}
                  name={r.name}
                  kind="user"
                  size="xl"
                  className="!h-44 !w-full !rounded-none !border-0 !shadow-none md:!h-48 [&_img]:object-[50%_32%]"
                />
                <span
                  className={cn(
                    'absolute right-3 top-3 inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                    selected ? 'bg-cinnabar text-white' : 'bg-surface text-ink-soft',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'h-3 w-3 rounded-full border',
                      selected ? 'border-white bg-white' : 'border-bluegray',
                    )}
                  />
                  {selected ? '已选择' : '选择此角色'}
                </span>
              </div>
              <div className="flex flex-1 flex-col p-5 sm:p-6">
                <p className="text-xs text-bluegray">{r.identity}</p>
                <h2 className="mt-2 text-xl font-semibold text-ink">{r.name}</h2>
                <p className="mt-2 text-sm font-medium leading-6 text-inkgreen">{r.tagline}</p>
                <p className="mt-3 flex-1 text-sm leading-7 text-ink-soft">{r.description}</p>
                <dl className="mt-5 space-y-3 border-t border-line pt-4 text-xs">
                  <div>
                    <dt className="font-semibold text-ink">初始能力</dt>
                    <dd className="mt-1 leading-6 text-bluegray">{r.perk}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-ink">剧情影响</dt>
                    <dd className="mt-1 leading-6 text-bluegray">{r.storyEffect}</dd>
                  </div>
                </dl>
              </div>
            </button>
          )
        })}
      </div>

      {/* 体验模式 */}
      <fieldset className="mt-10 border-t border-line pt-7">
        <legend className="pr-4 text-xl font-semibold text-ink">体验模式</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label
            className={cn(
              'flex cursor-pointer gap-3 rounded-lg border bg-surface p-5 transition-colors duration-200',
              mode === 'virtual'
                ? 'border-cinnabar ring-1 ring-cinnabar'
                : 'border-line hover:border-inkgreen/60',
            )}
          >
            <input
              type="radio"
              name="mode"
              className="mt-1 h-4 w-4 shrink-0 accent-cinnabar"
              checked={mode === 'virtual'}
              onChange={() => setMode('virtual')}
            />
            <span>
              <span className="block font-medium text-ink">虚拟游览</span>
              <span className="mt-2 block text-sm leading-7 text-bluegray">
                在地图上点击即可到达点位，随时随地体验完整故事。
              </span>
            </span>
          </label>
          <label
            className={cn(
              'flex cursor-pointer gap-3 rounded-lg border bg-surface p-5 transition-colors duration-200',
              mode === 'onsite'
                ? 'border-cinnabar ring-1 ring-cinnabar'
                : 'border-line hover:border-inkgreen/60',
            )}
          >
            <input
              type="radio"
              name="mode"
              className="mt-1 h-4 w-4 shrink-0 accent-cinnabar"
              checked={mode === 'onsite'}
              onChange={() => setMode('onsite')}
            />
            <span>
              <span className="block font-medium text-ink">实地探索</span>
              <span className="mt-2 block text-sm leading-7 text-bluegray">
                使用浏览器定位，走到点位触发范围内才能解锁剧情。位置仅用于触发判断，可随时清除。
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      <div className="mt-8 flex flex-col gap-5 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div aria-live="polite">
          {selectedRole ? (
            <>
              <p className="text-sm font-medium text-ink">
                {selectedRole.name} · {mode === 'virtual' ? '虚拟游览' : '实地探索'}
              </p>
              <p className="mt-1 text-xs text-bluegray">准备好后，即可进入路线地图。</p>
            </>
          ) : (
            <p className="text-sm text-bluegray">先选择一位角色</p>
          )}
        </div>
        <button
          ref={startButtonRef}
          type="button"
          className="btn-primary w-full sm:w-auto"
          disabled={!roleId || submitting}
          onClick={onStartClick}
        >
          {submitting ? '正在创建旅程…' : '创建旅程，开始体验'}
        </button>
      </div>

      {error && !confirming ? (
        <p className="mt-4 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {/* 覆盖确认 */}
      <dialog
        ref={restartDialogRef}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl border border-line bg-surface p-0 text-ink backdrop:bg-ink/45"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="restart-title"
        aria-describedby="restart-description"
        aria-busy={submitting}
        onCancel={(event) => {
          event.preventDefault()
          if (!submitting && !startPendingRef.current) setConfirming(false)
        }}
        onClose={() => {
          setConfirming(false)
          startButtonRef.current?.focus()
        }}
      >
        <div className="p-6 sm:p-7">
          <h2 id="restart-title" className="text-lg font-semibold text-ink">
            已有进行中的旅程
          </h2>
          <p id="restart-description" className="mt-3 text-sm leading-7 text-ink-soft">
            重新开始会清空当前旅程的进度、线索与图鉴解锁记录。
          </p>
          {error && confirming ? (
            <p className="mt-4 text-sm leading-6 text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              autoFocus
              className="btn-ghost"
              disabled={submitting}
              onClick={() => setConfirming(false)}
            >
              继续原旅程
            </button>
            <button type="button" className="btn-primary" disabled={submitting} onClick={doStart}>
              {submitting ? '正在创建旅程…' : '清空并重新开始'}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  )
}
