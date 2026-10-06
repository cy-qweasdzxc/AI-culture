import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DemoDataNotice from '@/components/DemoDataNotice'
import { useJourney } from '@/engine/journeyStore'
import { cn } from '@/utils/cn'

export default function SettingsPage() {
  const navigate = useNavigate()
  const mode = useJourney((s) => s.mode)
  const setMode = useJourney((s) => s.setMode)
  const state = useJourney((s) => s.state)
  const resetJourney = useJourney((s) => s.resetJourney)
  const [confirming, setConfirming] = useState(false)

  const hasJourney = state !== 'CREATED'

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-serif text-2xl font-bold text-ink">设置与隐私</h1>

      <section className="card mt-6 p-6">
        <h2 className="font-serif text-lg font-bold text-inkgreen">体验模式</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          当前模式：<strong>{mode === 'virtual' ? '虚拟游览' : '实地探索'}</strong>。两种模式剧情内容一致，可随时切换。
        </p>
        <div className="mt-3 flex gap-2" role="group" aria-label="切换体验模式">
          <button
            type="button"
            onClick={() => setMode('virtual')}
            disabled={!hasJourney}
            aria-pressed={mode === 'virtual'}
            className={cn('chip min-h-9 px-4', mode === 'virtual' ? 'border-cinnabar bg-cinnabar text-white' : 'text-ink-soft')}
          >
            虚拟游览
          </button>
          <button
            type="button"
            onClick={() => setMode('onsite')}
            disabled={!hasJourney}
            aria-pressed={mode === 'onsite'}
            className={cn('chip min-h-9 px-4', mode === 'onsite' ? 'border-cinnabar bg-cinnabar text-white' : 'text-ink-soft')}
          >
            实地探索
          </button>
        </div>
      </section>

      <section className="card mt-5 p-6">
        <h2 className="font-serif text-lg font-bold text-inkgreen">定位与隐私</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-soft">
          <li>定位仅用于实地模式的点位触发校验（约 120-150 米半径），在浏览器本地完成，不长期保存原始坐标。</li>
          <li>平台不需要注册：旅程数据保存在你自己的浏览器中（localStorage），清除后不可恢复。</li>
          <li>若拒绝定位授权，可随时切换为虚拟游览模式，不影响任何剧情内容。</li>
        </ul>
        <button type="button" className="btn-secondary mt-4" disabled={!hasJourney} onClick={() => setConfirming(true)}>
          清除全部旅程数据
        </button>
      </section>

      <section className="card mt-5 p-6">
        <h2 className="font-serif text-lg font-bold text-inkgreen">AI 说明</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          NPC 对话采用检索增强生成（RAG）：先检索人工审核过的文化资料，再生成角色化回答，回答附证据编号；
          证据不足或超出知识边界时，NPC 使用固定话术拒答。正式版本中，任务、道具、图鉴与结局的任何变化都必须经服务端状态机校验，AI
          无权直接修改。
        </p>
        <div className="mt-4">
          <DemoDataNotice />
        </div>
      </section>

      {confirming ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="clear-title"
        >
          <div className="card max-w-sm p-6">
            <h2 id="clear-title" className="font-serif text-lg font-bold text-ink">
              确认清除全部数据？
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              将删除本浏览器中的旅程进度、线索、图鉴解锁与对话记录，且不可恢复。
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" className="btn-ghost" onClick={() => setConfirming(false)}>
                取消
              </button>
              <button
                type="button"
                className="btn bg-danger text-white hover:opacity-90"
                onClick={() => {
                  resetJourney()
                  setConfirming(false)
                  navigate('/')
                }}
              >
                确认清除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
