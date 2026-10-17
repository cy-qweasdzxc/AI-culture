import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DemoDataNotice from '@/components/DemoDataNotice'
import Icon from '@/components/Icon'
import { useJourney } from '@/engine/journeyStore'
import { cn } from '@/utils/cn'

export default function SettingsPage() {
  const navigate = useNavigate()
  const mode = useJourney((s) => s.mode)
  const setMode = useJourney((s) => s.setMode)
  const state = useJourney((s) => s.state)
  const clearSession = useJourney((s) => s.clearSession)
  const busy = useJourney((s) => s.busy)
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
              <dd>
                仅在授权后读取浏览器坐标，提交服务端计算距离和定位精度，不保存原始坐标。浏览器位置可被模拟，此校验不构成可信位置证明。
              </dd>
            </div>
            <div>
              <dt className="mb-1 font-semibold text-ink">旅程记录</dt>
              <dd>
                平台不需要注册：HttpOnly Cookie
                关联匿名会话，旅程进度保存在服务端，刷新后可恢复。清除操作删除当前会话及其旅程记录。
              </dd>
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
        <div>
          <h2 className="text-xl font-semibold text-ink">AI 说明</h2>
          <p className="mt-2 text-sm leading-7 text-bluegray">回答可查看来源，剧情由规则推进。</p>
        </div>
        <div>
          <p className="text-sm leading-8 text-ink-soft">
            NPC
            对话通过服务端检索与模型适配器生成，提供方和资料模式在回答中明示。当前知识按自动发布策略进入检索，资料仍可能未经人工核验。
            证据不足或超出知识边界时，NPC
            使用固定话术拒答。任务、道具、图鉴与结局的任何变化都必须经服务端状态机校验，AI
            无权直接修改。
          </p>
          <div className="mt-4">
            <DemoDataNotice />
          </div>
        </div>
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
          将删除当前匿名会话及其服务端旅程进度、线索、图鉴解锁与对话记录，且不可恢复。
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
