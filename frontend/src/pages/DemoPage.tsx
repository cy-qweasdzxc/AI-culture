import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PersonaAvatar from '@/components/PersonaAvatar'
import Icon from '@/components/Icon'
import { useJourney } from '@/engine/journeyStore'
import { cn } from '@/utils/cn'

/** 虚拟游览：无需定位的比赛演示入口。 */
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
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="border-b border-line pb-7 sm:pb-9">
        <p className="flex items-center gap-2 text-sm font-medium text-inkgreen">
          <Icon name="compass" />
          比赛演示 · 无需定位
        </p>
        <h1 className="mt-4 max-w-2xl font-serif text-3xl font-bold leading-snug text-ink sm:text-4xl">
          用一段旅程，了解平江寻梦
        </h1>
        <p className="mt-5 max-w-prose text-sm leading-8 text-ink-soft">
          演示模式固定为虚拟游览：点击地图即可到达点位，与 NPC
          对话收集证据，解开六道谜题，在尾声做出选择并生成报告。
        </p>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14">
        <section aria-labelledby="demo-route-title">
          <h2 id="demo-route-title" className="text-xl font-semibold text-ink">
            这段旅程如何展开
          </h2>
          <ol className="mt-5 divide-y divide-line text-sm text-ink-soft">
            <li className="flex gap-4 py-5 first:pt-0">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-inkgreen/10 text-xs font-semibold tabular-nums text-inkgreen">
                1
              </span>
              <div>
                <h3 className="font-semibold text-ink">平江路，开启寻访</h3>
                <p className="mt-2 leading-7">
                  到达平江路，向周伯打听《平江图》，拿到纪年线索，完成两道谜题。
                </p>
              </div>
            </li>
            <li className="flex gap-4 py-5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-inkgreen/10 text-xs font-semibold tabular-nums text-inkgreen">
                2
              </span>
              <div>
                <h3 className="font-semibold text-ink">沿路入园，收集线索</h3>
                <p className="mt-2 leading-7">
                  顺路线解锁耦园、狮子林、拙政园，阿蘅会给你一片湖石。
                </p>
              </div>
            </li>
            <li className="flex gap-4 py-5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-inkgreen/10 text-xs font-semibold tabular-nums text-inkgreen">
                3
              </span>
              <div>
                <h3 className="font-semibold text-ink">抵达苏博，连起发现</h3>
                <p className="mt-2 leading-7">在苏博向小沈要到白壁照片，组合两条线索，对出下联。</p>
              </div>
            </li>
            <li className="flex gap-4 py-5 last:pb-0">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-inkgreen/10 text-xs font-semibold tabular-nums text-inkgreen">
                4
              </span>
              <div>
                <h3 className="font-semibold text-ink">尾声，留下你的选择</h3>
                <p className="mt-2 leading-7">在尾声选择挂灯或收灯，进入结局，查看体验报告。</p>
              </div>
            </li>
          </ol>
        </section>

        <div className="border-t border-line pt-7 lg:border-t-0 lg:pt-0">
          <fieldset>
            <legend className="text-xl font-semibold text-ink">选择演示角色</legend>
            <p className="mt-3 text-sm leading-7 text-bluegray">
              以不同身份进入故事，听见不同的对话。
            </p>
            <div className="mt-5 flex flex-col gap-3">
              {roles.map((r) => (
                <label
                  key={r.id}
                  className={cn(
                    'flex min-h-24 cursor-pointer items-center gap-3 rounded-lg border p-4 text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-cinnabar',
                    roleId === r.id
                      ? 'border-inkgreen bg-inkgreen/5'
                      : 'border-line bg-surface hover:border-inkgreen hover:bg-paper-deep',
                  )}
                >
                  <input
                    type="radio"
                    name="demo-role"
                    className="sr-only"
                    disabled={busy}
                    checked={roleId === r.id}
                    onChange={() => setRoleId(r.id)}
                  />
                  <PersonaAvatar id={r.id} name={r.name} kind="user" size="lg" />
                  <span className="min-w-0">
                    <span className="block font-semibold text-ink">{r.name}</span>
                    <span className="mt-1 block text-xs leading-6 text-bluegray">{r.tagline}</span>
                  </span>
                  <span
                    className={cn(
                      'ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                      roleId === r.id ? 'border-inkgreen bg-inkgreen text-white' : 'border-line',
                    )}
                    aria-hidden
                  >
                    {roleId === r.id ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <p className="mt-5 text-xs leading-6 text-bluegray">
            进入演示会重置当前匿名会话的服务端旅程。模型与资料模式将在对话中标明。
          </p>
          <button type="button" className="btn-primary mt-5 w-full" disabled={busy} onClick={start}>
            {busy ? '正在创建…' : '进入演示'}
            {!busy ? <Icon name="arrow" /> : null}
          </button>
          {error ? (
            <p role="alert" className="mt-3 text-sm leading-7 text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
