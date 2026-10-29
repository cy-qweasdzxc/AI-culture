import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PersonaAvatar from '@/components/PersonaAvatar'
import { useJourney } from '@/engine/journeyStore'
import type { AudienceMode, DifficultyLevel } from '@/types'

export default function DemoPage() {
  const navigate = useNavigate()
  const s = useJourney()
  const [roleId, setRoleId] = useState('')
  const [audience, setAudience] = useState<AudienceMode>('adult')
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('normal')
  const [confirming, setConfirming] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const restartButton = useRef<HTMLButtonElement>(null)
  const hasJourney = !!s.journeyId && s.state !== 'CREATED'
  const selectedRole = roleId || s.roles[0]?.id
  const disabled = s.busy || starting || !selectedRole

  useEffect(() => {
    if (confirming && !dialog.current?.open) dialog.current?.showModal()
    else if (!confirming && dialog.current?.open) dialog.current.close()
  }, [confirming])

  async function start() {
    if (!selectedRole || pending.current || s.busy) return
    pending.current = true
    setStarting(true); setError('')
    try {
      if (hasJourney) await s.resetJourney()
      // This dedicated entry explicitly starts the advertised classic demo.
      // Other routes remain available through the city/route selector.
      await s.startJourney(selectedRole, 'virtual', {
        audience_mode: audience, difficulty, route_id: 'suzhou-classic',
      })
      setConfirming(false)
      navigate('/map')
    } catch (err) { setError(err instanceof Error ? err.message : '演示旅程暂时无法创建，请重试。') }
    finally { pending.current = false; setStarting(false) }
  }

  return <div className="demo-page page-width py-8 sm:py-12">
    <header className="border-b border-line pb-6">
      <p className="text-sm font-medium text-inkgreen">比赛演示 · 无需定位</p>
      <h1 className="mt-3 font-serif text-3xl font-bold leading-snug">用一段旅程，了解平江寻梦</h1>
      <p className="mt-4 max-w-prose text-sm leading-8 text-ink-soft">苏州经典五站虚拟旅程：与 NPC 对话收集线索，完成六道主线谜题，选择结局并查看报告。另有十五道自选挑战和八项探索，可自由选择。</p>
    </header>
    {hasJourney && <section className="mt-6 rounded-xl border border-inkgreen/30 bg-surface p-5" aria-label="已有旅程">
      <h2 className="font-semibold">你已有一段旅程</h2>
      <p className="mt-2 text-sm leading-7">进入此页不会清空进度。可继续原路线；下方重新开始会在确认后创建苏州经典演示，替换当前旅程。</p>
      <Link to="/map" className="btn-primary mt-4">继续已有旅程</Link>
    </section>}
    <div className="mt-7 grid min-w-0 gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="rounded-xl border border-line bg-surface p-5" aria-labelledby="demo-steps">
        <h2 id="demo-steps" className="text-xl font-semibold">这段旅程如何展开</h2>
        <ol className="mt-4 list-inside list-decimal space-y-4 text-sm leading-8">
          <li>平江路开启寻访，向周伯打听《平江图》，收集纪年线索。</li>
          <li>沿路进入耦园、狮子林和拙政园，观察空间、寻找证据。</li>
          <li>抵达苏州博物馆，联系沿途线索，完成最后的推理。</li>
          <li>在尾声选择挂灯或收灯，查看结局、图鉴与体验报告。</li>
        </ol>
        <Link to="/theme" className="inline-link mt-5 inline-flex min-h-11 items-center">查看其他城市与路线</Link>
      </section>
      <section className="min-w-0 rounded-xl border border-line bg-surface p-5" aria-label="演示设置">
        <fieldset><legend className="text-xl font-semibold">选择演示角色</legend>
          <div className="mt-3 grid gap-3">
            {s.roles.map(role => <label key={role.id} className="flex min-h-16 cursor-pointer items-center gap-3 rounded-lg border border-line p-3">
              <input type="radio" name="demo-role" value={role.id} checked={selectedRole === role.id} onChange={() => setRoleId(role.id)} />
              <PersonaAvatar id={role.id} name={role.name} kind="user" size="sm" />
              <span className="text-sm font-medium">{role.name}<span className="mt-1 block text-xs font-normal text-bluegray">{role.identity}</span></span>
            </label>)}
          </div>
        </fieldset>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">演示人群<select className="input mt-2 w-full" value={audience} onChange={e => {
            const value = e.target.value as AudienceMode; setAudience(value); setDifficulty(value === 'child' || value === 'senior' ? 'easy' : 'normal')
          }}><option value="child">儿童</option><option value="student">学生</option><option value="adult">成人</option><option value="senior">老人</option></select></label>
          <label className="text-sm">演示难度<select className="input mt-2 w-full" value={difficulty} onChange={e => setDifficulty(e.target.value as DifficultyLevel)}><option value="easy">简单</option><option value="normal">标准</option><option value="advanced">深入</option></select></label>
        </div>
        {error && !confirming && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
        {hasJourney
          ? <button ref={restartButton} className="btn-secondary mt-5 w-full" disabled={disabled} onClick={() => setConfirming(true)}>重新开始苏州经典演示</button>
          : <button className="btn-primary mt-5 w-full" disabled={disabled} onClick={() => void start()}>{starting ? '正在创建演示…' : '开始苏州经典演示'}</button>}
        <p className="mt-3 text-xs leading-6 text-bluegray">演示固定为虚拟游览，不读取定位。文化证据和剧情虚构分别标注，人群模式不改变审核要求。</p>
      </section>
    </div>
    <dialog ref={dialog} className="w-[min(92vw,28rem)] rounded-xl border border-line bg-surface p-6 text-ink backdrop:bg-black/40"
      aria-labelledby="restart-demo-title" onCancel={e => { e.preventDefault(); if (!starting) setConfirming(false) }}
      onClose={() => { setConfirming(false); restartButton.current?.focus() }}>
      <h2 id="restart-demo-title" className="text-xl font-semibold">重新开始苏州经典演示？</h2>
      <p className="mt-3 text-sm leading-7">将清空当前旅程的任务、背包和对话，创建所选角色的苏州经典五站虚拟旅程。其他城市或路线的进度也会被替换。</p>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-5 flex flex-wrap gap-3"><button autoFocus className="btn-secondary" disabled={starting} onClick={() => setConfirming(false)}>保留当前旅程</button>
        <button className="btn-primary" disabled={disabled} onClick={() => void start()}>{starting ? '正在重新开始…' : '确认重新开始演示'}</button></div>
    </dialog>
  </div>
}
