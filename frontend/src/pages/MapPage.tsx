import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MapView from '@/components/MapView'
import SchematicMap from '@/components/SchematicMap'
import { useJourney } from '@/engine/journeyStore'
import type { SpotStatus } from '@/types'
import { cn } from '@/utils/cn'

const statusMeta: Record<SpotStatus, { icon: string; label: string; cls: string }> = {
  undiscovered: { icon: '？', label: '未发现', cls: 'border-line bg-paper-deep text-bluegray' },
  discovered: { icon: '!', label: '已发现', cls: 'border-bronze bg-surface text-bronze' },
  current: { icon: '●', label: '当前点位', cls: 'border-cinnabar bg-cinnabar text-white' },
  completed: { icon: '✓', label: '已完成', cls: 'border-inkgreen bg-inkgreen text-white' },
}

export default function MapPage() {
  const navigate = useNavigate()
  const spotStatus = useJourney((s) => s.spotStatus)
  const mode = useJourney((s) => s.mode)
  const setMode = useJourney((s) => s.setMode)
  const arriveSpot = useJourney((s) => s.arriveSpot)
  const spots = useJourney((s) => s.spots)
  const busy = useJourney((s) => s.busy)
  const totalSpots = useJourney((s) => s.report?.totalSpotCount ?? 5)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const selected = spots.find((spot) => spot.id === selectedId)
  const selectedStatus = selectedId ? (spotStatus[selectedId] ?? 'undiscovered') : undefined

  const doArriveVirtual = async (spotId: string) => {
    try {
      await arriveSpot(spotId)
      setFeedback(null)
      navigate(`/spot/${spotId}`)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '点位触发失败。')
    }
  }

  const doLocate = () => {
    if (!selected || !selectedId) return
    if (!navigator.geolocation) {
      setFeedback('当前浏览器不支持定位，可切换为虚拟游览模式。')
      return
    }
    setLocating(true)
    setFeedback(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await arriveSpot(selectedId, {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy_m: pos.coords.accuracy,
            coordinate_system: 'wgs84',
          })
          navigate(`/spot/${selectedId}`)
        } catch (error) {
          setFeedback(error instanceof Error ? error.message : '定位触发失败。')
        } finally {
          setLocating(false)
        }
      },
      () => {
        setLocating(false)
        setFeedback('定位失败或授权被拒绝。可以在设置中检查定位权限，或切换为虚拟游览模式。')
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl font-bold text-ink">平江寻梦 · 路线</h1>
        <div className="flex items-center gap-2 text-sm" role="group" aria-label="体验模式切换">
          <button
            type="button"
            disabled={busy}
            onClick={() => void setMode('virtual').catch(() => undefined)}
            className={cn(
              'chip min-h-8 px-3',
              mode === 'virtual' ? 'border-cinnabar bg-cinnabar text-white' : 'text-ink-soft',
            )}
            aria-pressed={mode === 'virtual'}
          >
            虚拟游览
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void setMode('onsite').catch(() => undefined)}
            className={cn(
              'chip min-h-8 px-3',
              mode === 'onsite' ? 'border-cinnabar bg-cinnabar text-white' : 'text-ink-soft',
            )}
            aria-pressed={mode === 'onsite'}
          >
            实地探索
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[260px_1fr_300px]">
        {/* 左：章节与点位列表 */}
        <ol className="order-2 space-y-2 lg:order-1">
          {spots.map((s) => {
            const st = spotStatus[s.id] ?? 'undiscovered'
            const meta = statusMeta[st]
            const locked = st === 'undiscovered'
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => !locked && setSelectedId(s.id)}
                  disabled={locked}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                    locked
                      ? 'cursor-not-allowed border-dashed border-line bg-paper-deep/50'
                      : 'border-line bg-surface hover:border-bronze',
                    selectedId === s.id && 'border-cinnabar ring-2 ring-cinnabar/20',
                  )}
                  aria-label={`${s.name}，${meta.label}`}
                >
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold',
                      meta.cls,
                    )}
                    aria-hidden
                  >
                    {meta.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block truncate text-sm font-medium',
                        locked ? 'text-bluegray' : 'text-ink',
                      )}
                    >
                      {locked ? '？？？' : s.name}
                    </span>
                    <span className="block text-xs text-bluegray">{meta.label}</span>
                  </span>
                  <span className="text-xs text-bluegray">第 {s.order} 站</span>
                </button>
              </li>
            )
          })}
          {Array.from({ length: Math.max(0, totalSpots - spots.length) }, (_, i) => (
            <li
              key={`locked-${i}`}
              className="rounded-lg border border-dashed border-line p-3 text-sm text-bluegray"
            >
              ？ 未发现 · 完成前一站后解锁
            </li>
          ))}
        </ol>

        {/* 中：地图（在线或示意降级） */}
        <div className="card order-1 h-[420px] overflow-hidden lg:order-2 lg:h-[560px]">
          {mapError ? (
            <SchematicMap
              spots={spots}
              spotStatus={spotStatus}
              reason={mapError}
              onSpotClick={(id) => setSelectedId(id)}
            />
          ) : (
            <MapView
              spots={spots}
              spotStatus={spotStatus}
              onSpotClick={(id) => setSelectedId(id)}
              onUnavailable={(r) => setMapError(r)}
            />
          )}
        </div>

        {/* 右：点位浮层 */}
        <aside className="order-3 lg:sticky lg:top-20 lg:self-start">
          {selected && selectedStatus ? (
            <div className="card anim-fade-rise p-5" key={selected.id}>
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-lg font-bold text-ink">{selected.name}</h2>
                <span className={cn('chip border', statusMeta[selectedStatus].cls)}>
                  {statusMeta[selectedStatus].label}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{selected.intro}</p>
              <p className="mt-2 text-xs text-bluegray">
                演示路线 · 点位坐标为近似值，精确位置【待核实】。
              </p>

              <div className="mt-4 space-y-2">
                {selectedStatus === 'discovered' && mode === 'virtual' ? (
                  <button
                    type="button"
                    className="btn-primary w-full"
                    disabled={busy}
                    onClick={() => doArriveVirtual(selected.id)}
                  >
                    到达此点（虚拟游览）
                  </button>
                ) : null}
                {selectedStatus === 'discovered' && mode === 'onsite' ? (
                  <button
                    type="button"
                    className="btn-primary w-full"
                    disabled={locating || busy}
                    onClick={doLocate}
                  >
                    {locating ? '正在定位…' : '使用我的位置到达'}
                  </button>
                ) : null}
                {selectedStatus === 'current' || selectedStatus === 'completed' ? (
                  <>
                    <button
                      type="button"
                      className="btn-primary w-full"
                      onClick={() => navigate(`/spot/${selected.id}`)}
                    >
                      进入点位剧情
                    </button>
                    {selected.npcId ? (
                      <button
                        type="button"
                        className="btn-secondary w-full"
                        onClick={() => navigate(`/chat/${selected.npcId}`)}
                      >
                        与 NPC 对话
                      </button>
                    ) : null}
                  </>
                ) : null}
                {selectedStatus === 'discovered' && mode === 'virtual' ? null : null}
              </div>

              {feedback ? (
                <p
                  className="mt-3 rounded-md bg-warning/10 px-3 py-2 text-xs leading-relaxed text-ink-soft"
                  role="status"
                >
                  {feedback}
                </p>
              ) : null}
              {selectedStatus === 'discovered' ? (
                <p className="mt-3 text-xs text-bluegray">
                  {mode === 'virtual'
                    ? '虚拟模式：点击上方按钮即可到达。'
                    : `实地模式：进入 ${selected.triggerRadiusM} 米范围后触发。`}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="card p-5 text-sm text-bluegray">
              <p>点击地图标记或左侧点位，查看详情与可执行的操作。</p>
              <p className="mt-2">点位状态：？未发现 / ! 已发现 / ● 当前 / ✓ 已完成。</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
