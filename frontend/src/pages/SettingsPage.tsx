import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '@/components/Icon'
import { useJourney } from '@/engine/journeyStore'
import { cn } from '@/utils/cn'
import type { AudienceMode, DifficultyLevel } from '@/types'

export default function SettingsPage() {
  const navigate = useNavigate()
  const mode = useJourney((s) => s.mode)
  const setMode = useJourney((s) => s.setMode)
  const state = useJourney((s) => s.state)
  const clearSession = useJourney((s) => s.clearSession)
  const busy = useJourney((s) => s.busy)
  const audience = useJourney((s) => s.audienceMode ?? 'adult')
  const difficulty = useJourney((s) => s.difficulty ?? 'normal')
  const difficultyLocked = useJourney(
    (s) =>
      Object.values(s.taskStates).some((task) => task.attempts > 0) ||
      Object.values(s.activityStates ?? {}).some((activity) => activity.attempts > 0),
  )
  const setProfile = useJourney((s) => s.setProfile)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)

  const hasJourney = state !== 'CREATED'

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (confirming && !dialog.open) dialog.showModal()
    if (!confirming && dialog.open) dialog.close()
  }, [confirming])

  return (
    <div className="mx-auto max-w-5xl px-4 py-7 sm:px-6 lg:py-10">
      <header className="border-b border-line pb-7 sm:pb-9">
        <h1 className="font-serif text-3xl font-bold text-ink sm:text-4xl">设置与隐私</h1>
        <p className="mt-3 text-sm leading-7 text-bluegray">
          调整游览方式，了解资料与旅程数据的使用。
        </p>
      </header>

      <section
        className="grid gap-4 border-b border-line py-6 sm:grid-cols-2"
        aria-label="调整人群与难度"
        aria-busy={busy}
      >
        <label className="text-sm">
          表达模式
          <select
            className="input mt-2"
            aria-label="表达模式"
            value={audience}
            disabled={!hasJourney || busy}
            onChange={(event) =>
              void setProfile(event.target.value as AudienceMode).catch((err: Error) =>
                setError(err.message),
              )
            }
          >
            <option value="child">儿童｜卡通引导</option>
            <option value="student">学生｜证据与推理</option>
            <option value="adult">成人｜深度内容</option>
            <option value="senior">老人｜大字语音</option>
          </select>
        </label>
        <label className="text-sm">
          任务难度
          <select
            className="input mt-2"
            aria-label="任务难度"
            value={difficulty}
            disabled={!hasJourney || busy || difficultyLocked}
            onChange={(event) =>
              void setProfile(audience, event.target.value as DifficultyLevel).catch((err: Error) =>
                setError(err.message),
              )
            }
          >
            <option value="easy">简单</option>
            <option value="normal">标准</option>
            <option value="advanced">深入</option>
          </select>
        </label>
        <p className="text-xs leading-6 text-bluegray sm:col-span-2">
          设置随旅程保存。开始答题后难度固定，表达模式仍可调整；不采集真实年龄或姓名。
        </p>
        {hasJourney && (
          <p role="status" className="text-xs text-bluegray sm:col-span-2">
            {busy ? '正在保存设置，请等待完成后刷新…' : '设置已保存。'}
          </p>
        )}
      </section>
      <section className="grid gap-5 border-b border-line py-7 sm:py-9 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
        <div>
          <h2 className="text-xl font-semibold text-ink">体验模式</h2>
          <p className="mt-2 text-sm leading-7 text-bluegray">选择适合当下的游览方式。</p>
        </div>
        <div>
          <p className="text-sm leading-7 text-ink-soft">
            当前模式：<strong>{mode === 'virtual' ? '虚拟游览' : '实地探索'}</strong>
            。两种模式剧情内容一致，可随时切换。
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3" role="group" aria-label="切换体验模式">
            <button
              type="button"
              onClick={() => void setMode('virtual').catch((err: Error) => setError(err.message))}
              disabled={!hasJourney || busy}
              aria-label="虚拟游览"
              aria-pressed={mode === 'virtual'}
              className={cn(
                'flex min-h-24 flex-col items-start justify-center gap-2 rounded-lg border px-4 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cinnabar disabled:cursor-not-allowed disabled:opacity-50',
                mode === 'virtual'
                  ? 'border-inkgreen bg-inkgreen/5 text-inkgreen'
                  : 'border-line bg-surface text-ink-soft hover:border-inkgreen',
              )}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Icon name="map" />
                虚拟游览
              </span>
              <span className="text-xs leading-6">点击地图到达点位</span>
            </button>
            <button
              type="button"
              onClick={() => void setMode('onsite').catch((err: Error) => setError(err.message))}
              disabled={!hasJourney || busy}
              aria-label="实地探索"
              aria-pressed={mode === 'onsite'}
              className={cn(
                'flex min-h-24 flex-col items-start justify-center gap-2 rounded-lg border px-4 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cinnabar disabled:cursor-not-allowed disabled:opacity-50',
                mode === 'onsite'
                  ? 'border-inkgreen bg-inkgreen/5 text-inkgreen'
                  : 'border-line bg-surface text-ink-soft hover:border-inkgreen',
              )}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Icon name="pin" />
                实地探索
              </span>
              <span className="text-xs leading-6">使用定位触发点位</span>
            </button>
          </div>
          {!hasJourney ? (
            <p className="mt-3 text-xs leading-6 text-bluegray">创建旅程后，即可在这里切换模式。</p>
          ) : null}
        </div>
      </section>

      <section className="grid gap-5 border-b border-line py-7 sm:py-9 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
        <div>
          <h2 className="text-xl font-semibold text-ink">定位与隐私</h2>
          <p className="mt-2 text-sm leading-7 text-bluegray">无需注册，进度关联匿名会话。</p>
        </div>
        <div>
          <dl className="space-y-5 text-sm leading-7 text-ink-soft">
            <div>
              <dt className="mb-1 font-semibold text-ink">位置授权</dt>
              <dd>仅在你授权并使用实地探索时读取位置，用于判断是否到达点位，不保存原始坐标。浏览器位置可被模拟，此校验不构成可信位置证明。</dd>
            </div>
            <div>
              <dt className="mb-1 font-semibold text-ink">旅程记录</dt>
              <dd>旅程进度会自动保存，刷新后可继续。你可以随时清除本次旅程及相关记录。</dd>
            </div>
            <div>
              <dt className="mb-1 font-semibold text-ink">不使用定位</dt>
              <dd>若拒绝定位授权，可随时切换为虚拟游览模式，不影响任何剧情内容。</dd>
            </div>
          </dl>
          <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-line pt-5">
            <button
              type="button"
              className="btn border border-danger/40 bg-surface text-danger hover:border-danger hover:bg-danger/5"
              disabled={!hasJourney || busy}
              onClick={() => {
                setError(null)
                setConfirming(true)
              }}
            >
              清除全部旅程数据
            </button>
            <p className="text-xs leading-6 text-bluegray">清除后无法恢复，请谨慎操作。</p>
          </div>
        </div>
      </section>

      <section className="grid gap-5 py-7 sm:py-9 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
        <div><h2 className="text-xl font-semibold text-ink">AI 说明</h2><p className="mt-2 text-sm leading-7 text-bluegray">回答可查看来源，剧情由规则推进。</p></div>
        <p className="text-sm leading-8 text-ink-soft">NPC 使用经过人工审核且与当前内容版本匹配的文化资料回答；待审核来源候选仅供预览。证据不足时会说明无法确认。任务、道具、图鉴和结局均按游戏规则判定，AI 无权直接修改。</p>
      </section>

      {error && !confirming ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <dialog
        ref={dialogRef}
        className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-xl border border-line bg-surface p-6 text-ink backdrop:bg-ink/35 sm:p-7"
        role="alertdialog"
        aria-labelledby="clear-title"
        aria-describedby="clear-description"
        onClose={() => setConfirming(false)}
        onCancel={(event) => {
          if (busy) event.preventDefault()
        }}
      >
        <h2 id="clear-title" className="text-xl font-semibold text-ink">
          确认清除全部数据？
        </h2>
        <p id="clear-description" className="mt-3 text-sm leading-7 text-ink-soft">
          将删除本次旅程进度、线索、图鉴解锁与对话记录，且不可恢复。
        </p>
        {error && confirming ? (
          <p role="alert" className="mt-4 text-sm leading-7 text-danger">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            autoFocus
            className="btn-ghost"
            disabled={busy}
            onClick={() => setConfirming(false)}
          >
            取消
          </button>
          <button
            type="button"
            className="btn bg-danger text-white hover:opacity-90"
            disabled={busy}
            onClick={async () => {
              try {
                setError(null)
                await clearSession()
                setConfirming(false)
                navigate('/')
              } catch (err) {
                setError(err instanceof Error ? err.message : '清除失败。')
              }
            }}
          >
            {busy ? '正在清除…' : '确认清除'}
          </button>
        </div>
      </dialog>
    </div>
  )
}
