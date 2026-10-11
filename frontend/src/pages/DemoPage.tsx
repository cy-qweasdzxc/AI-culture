import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useJourney } from '@/engine/journeyStore'
import { cn } from '@/utils/cn'

/** 虚拟游览：比赛演示入口（无定位、三分钟走完核心闭环） */
export default function DemoPage() {
  const navigate = useNavigate()
  const startJourney = useJourney((s) => s.startJourney)
  const resetJourney = useJourney((s) => s.resetJourney)
  const roles = useJourney((s) => s.roles)
  const busy = useJourney((s) => s.busy)
  const [error, setError] = useState<string | null>(null)
  const [roleId, setRoleId] = useState(roles[0]?.id ?? 'scholar')

  const start = async () => {
    try {
      setError(null)
      if (useJourney.getState().journeyId) await resetJourney()
      await startJourney(roleId, 'virtual')
      navigate('/map')
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建演示旅程失败。')
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <p className="text-sm font-medium text-bronze">比赛演示 · 无需定位</p>
      <h1 className="mt-2 font-serif text-3xl font-bold text-ink">三分钟走完这条路线</h1>
      <p className="mt-4 max-w-prose text-sm leading-relaxed text-ink-soft">
        演示模式固定为虚拟游览：点击地图即可到达点位，与 NPC
        对话收集证据，解开六道谜题，在尾声做出选择并生成报告。 以下为演示准备的快捷路径：
      </p>

      <ol className="mt-6 space-y-2 text-sm text-ink-soft">
        <li className="flex gap-2.5">
          <span className="font-serif font-bold text-cinnabar">1.</span>
          到达平江路，向周伯打听《平江图》，拿到纪年线索，完成两道谜题
        </li>
        <li className="flex gap-2.5">
          <span className="font-serif font-bold text-cinnabar">2.</span>
          顺路线解锁耦园、狮子林、拙政园，阿蘅会给你一片湖石
        </li>
        <li className="flex gap-2.5">
          <span className="font-serif font-bold text-cinnabar">3.</span>
          在苏博向小沈要到白壁照片，组合两条线索，对出下联
        </li>
        <li className="flex gap-2.5">
          <span className="font-serif font-bold text-cinnabar">4.</span>
          在尾声选择挂灯或收灯，进入结局，查看体验报告
        </li>
      </ol>

      <fieldset className="mt-8">
        <legend className="font-serif text-lg font-bold text-ink">选择演示角色</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {roles.map((r) => (
            <label
              key={r.id}
              className={cn(
                'card cursor-pointer p-4 text-sm',
                roleId === r.id ? 'border-cinnabar ring-2 ring-cinnabar/25' : 'hover:border-bronze',
              )}
            >
              <input
                type="radio"
                name="demo-role"
                className="sr-only"
                checked={roleId === r.id}
                onChange={() => setRoleId(r.id)}
              />
              <span className="block font-medium text-ink">{r.name}</span>
              <span className="mt-1 block text-xs text-bluegray">{r.tagline}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <button type="button" className="btn-primary mt-8" disabled={busy} onClick={start}>
        {busy ? '正在创建…' : '进入演示'}
      </button>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <p className="mt-3 text-xs text-bluegray">
        进入演示会重置当前匿名会话的服务端旅程。模型与资料模式将在对话中标明。
      </p>
    </div>
  )
}
