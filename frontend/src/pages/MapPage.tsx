import ResilientImage from '@/components/ResilientImage'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MapView from '@/components/MapView'
import SchematicMap from '@/components/SchematicMap'
import { sceneVisual } from '@/data/sceneVisuals'
import { useJourney } from '@/engine/journeyStore'
import type { SpotStatus } from '@/types'
import { cn } from '@/utils/cn'
import { api } from '@/services/api'

interface WalkingRoute {
  status: 'walking' | 'schematic'
  polyline: { lat: number; lng: number }[]
  distance_m: number | null
  duration_minutes: number | null
  message: string
}

const statusMeta: Record<SpotStatus, { icon: string; label: string; cls: string }> = {
  undiscovered: { icon: '？', label: '未发现', cls: 'border-line bg-paper-deep text-bluegray' },
  discovered: { icon: '!', label: '已发现', cls: 'border-cinnabar/30 bg-cinnabar/5 text-cinnabar' },
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
  const journeyId = useJourney((s) => s.journeyId)
  const [walking, setWalking] = useState<WalkingRoute | null>(null)
  const visibleIds = spots.map((spot) => spot.id).join(',')
  useEffect(() => {
    let active = true
    setWalking(null)
    if (journeyId) api.post<WalkingRoute>('/navigation/walking', {
      journey_id: journeyId, stop_ids: visibleIds ? visibleIds.split(',') : [],
    }).then((route) => { if (active) setWalking(route) }).catch(() => { if (active) setWalking(null) })
    return () => { active = false }
  }, [journeyId, visibleIds])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const nextSpot =
    spots.find((spot) => spotStatus[spot.id] === 'current') ??
    spots.find((spot) => spotStatus[spot.id] === 'discovered') ??
    spots.find((spot) => spotStatus[spot.id] === 'completed')
  const selected = spots.find((spot) => spot.id === selectedId) ?? nextSpot
  const selectedStatus = selected ? (spotStatus[selected.id] ?? 'undiscovered') : undefined
  const selectedScene = sceneVisual(selected?.id)
  const completedCount = spots.filter((spot) => spotStatus[spot.id] === 'completed').length

  const selectSpot = (id: string) => {
    setSelectedId(id)
    setFeedback(null)
  }

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
    if (!selected) return
    if (!window.isSecureContext) {
      setFeedback('实地定位需要 HTTPS 安全连接。可以切换为虚拟游览继续体验。')
      return
    }
    if (!navigator.geolocation) {
      setFeedback('当前浏览器不支持定位，可切换为虚拟游览模式。')
      return
    }
    setLocating(true)
    setFeedback(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await arriveSpot(selected.id, {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy_m: pos.coords.accuracy,
            coordinate_system: 'wgs84',
          })
          navigate(`/spot/${selected.id}`)
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
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            平江寻梦 · 路线
          </h1>
          <p className="mt-3 text-sm leading-6 text-ink-soft">
            沿着水巷与园林前行，完成一站，打开下一段故事。
          </p>
        </div>
        <div
          className="inline-flex max-w-full rounded-lg border border-line bg-surface p-1"
          role="group"
          aria-label="体验模式切换"
        >
          {(
            [
              { key: 'virtual', label: '虚拟游览' },
              { key: 'onsite', label: '实地探索' },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              disabled={busy}
              onClick={() =>
                void setMode(item.key).catch((error: unknown) =>
                  setFeedback(error instanceof Error ? error.message : '模式切换失败。'),
                )
              }
              className={cn(
                'min-h-11 rounded-md px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                mode === item.key ? 'bg-inkgreen text-white' : 'text-ink-soft hover:bg-paper-deep',
              )}
              aria-pressed={mode === item.key}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>
      <p className="mt-4 text-xs leading-6 text-bluegray" role="status">
        {walking?.status === 'walking'
          ? `道路步行约 ${Math.round(walking.distance_m!)} 米 · ${Math.round(walking.duration_minutes!)} 分钟。${walking.message}`
          : '当前连线为示意路线，不是实际道路导航；步行距离和时间未知。'}
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-sm">
        <p className="font-medium text-ink">苏州 · 平江历史街区</p>
        <p className="text-bluegray">
          已完成{' '}
          <span className="font-semibold tabular-nums text-ink">
            {completedCount} / {totalSpots}
          </span>{' '}
          站
        </p>
      </div>

      <div className="mt-5 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_292px]">
        <div className="min-w-0">
          <section
            className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface"
            aria-label="路线地图与点位详情"
          >
            <div className="order-2 h-[360px] border-t border-line sm:order-1 sm:h-[440px] sm:border-b sm:border-t-0 lg:h-[420px]">
              {mapError ? (
                <div className="flex h-full flex-col">
                  <div className="min-h-0 flex-1"><SchematicMap spots={spots} spotStatus={spotStatus} reason={mapError} onSpotClick={selectSpot} /></div>
                  {mapError !== '未配置地图密钥' && <button type="button" className="min-h-11 shrink-0 border-t border-line bg-surface px-3 text-xs text-inkgreen"
                    onClick={() => setMapError(null)}>重新加载在线地图</button>}
                </div>
              ) : (
                <MapView
                  spots={spots}
                  spotStatus={spotStatus}
                  routeGeometry={walking?.status === 'walking' ? walking.polyline : undefined}
                  onSpotClick={selectSpot}
                  onUnavailable={setMapError}
                />
              )}
            </div>

            <div className="order-1 p-5 sm:order-2 sm:p-6" aria-live="polite">
              {selected && selectedStatus ? (
                <div key={selected.id}>
                  <div className="flex items-start gap-4">
                    {selectedScene ? (
                      <ResilientImage
                        src={selectedScene.src}
                        alt={`${selected.name}艺术化示意`}
                        className="h-20 w-20 shrink-0 rounded-md object-cover sm:h-24 sm:w-28"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <h2 className="text-xl font-semibold text-ink">{selected.name}</h2>
                        <span className={cn('chip', statusMeta[selectedStatus].cls)}>
                          {statusMeta[selectedStatus].label}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-ink-soft">{selected.intro}</p>
                      <p className="mt-1 text-xs text-bluegray">配图为艺术化示意；实景照片与来源见点位详情。</p>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    {selectedStatus === 'discovered' && mode === 'virtual' ? (
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={busy}
                        onClick={() => doArriveVirtual(selected.id)}
                      >
                        到达此点（虚拟游览）
                      </button>
                    ) : null}
                    {selectedStatus === 'discovered' && mode === 'onsite' ? (
                      <button
                        type="button"
                        className="btn-primary"
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
                          className="btn-primary"
                          onClick={() => navigate(`/spot/${selected.id}`)}
                        >
                          进入点位剧情
                        </button>
                        {selected.npcId ? (
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => navigate(`/chat/${selected.npcId}`)}
                          >
                            与 NPC 对话
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                  {feedback ? (
                    <p
                      className="mt-4 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm leading-6 text-ink-soft"
                      role="status"
                    >
                      {feedback}
                    </p>
                  ) : null}
                  {selectedStatus === 'discovered' ? (
                    <p className="mt-3 text-xs leading-5 text-bluegray">
                      {mode === 'virtual'
                        ? '虚拟模式：点击上方按钮即可到达。'
                        : `实地模式：进入 ${selected.triggerRadiusM} 米范围后触发。`}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs leading-5 text-bluegray">
                    演示路线 · 点位坐标为近似值，精确位置【待核实】。
                  </p>
                </div>
              ) : (
                <div className="py-3 text-sm leading-6 text-bluegray">
                  <h2 className="text-base font-semibold text-ink">选择你的下一站</h2>
                  <p className="mt-2">点击地图标记或路线点位，查看详情与可执行的操作。</p>
                  {feedback ? (
                    <p className="mt-3" role="status">
                      {feedback}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </section>
          <p className="mt-3 text-xs leading-5 text-bluegray">
            点位状态：？未发现 / ! 已发现 / ● 当前 / ✓ 已完成。
          </p>
        </div>

        <aside className="min-w-0 lg:sticky lg:top-24" aria-label="章节与点位列表">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink">沿途五站</h2>
            <span className="text-xs text-bluegray">按剧情顺序解锁</span>
          </div>
          <ol className="overflow-hidden rounded-xl border border-line bg-surface">
            {spots.map((spot) => {
              const status = spotStatus[spot.id] ?? 'undiscovered'
              const meta = statusMeta[status]
              const locked = status === 'undiscovered'
              return (
                <li key={spot.id} className="border-b border-line last:border-0">
                  <button
                    type="button"
                    onClick={() => selectSpot(spot.id)}
                    disabled={locked}
                    className={cn(
                      'flex min-h-[88px] w-full items-center gap-3 px-4 py-4 text-left transition-colors disabled:cursor-not-allowed',
                      selected?.id === spot.id
                        ? 'bg-cinnabar/5'
                        : 'hover:bg-paper-deep disabled:hover:bg-transparent',
                    )}
                    aria-label={`${spot.name}，${meta.label}`}
                    aria-pressed={selected?.id === spot.id}
                  >
                    <span
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold',
                        meta.cls,
                      )}
                      aria-hidden
                    >
                      {status === 'completed' ? meta.icon : locked ? meta.icon : spot.order}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block text-sm font-semibold',
                          locked ? 'text-bluegray' : 'text-ink',
                        )}
                      >
                        {locked ? '？？？' : spot.name}
                      </span>
                      <span className="mt-1 block text-xs text-bluegray">
                        第 {spot.order} 站 · {meta.label}
                      </span>
                    </span>
                    {!locked ? (
                      <span className="text-ink-soft" aria-hidden>
                        ↗
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
            {Array.from({ length: Math.max(0, totalSpots - spots.length) }, (_, index) => (
              <li
                key={`locked-${index}`}
                className="flex min-h-[88px] items-center gap-3 border-b border-line px-4 py-4 text-sm text-bluegray last:border-0"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-line bg-paper-deep"
                  aria-hidden
                >
                  ？
                </span>
                <span>
                  未发现<span className="mt-1 block text-xs">完成前一站后解锁</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs leading-5 text-bluegray">
            {mode === 'virtual'
              ? '当前为虚拟游览，无需定位，在线体验完整路线。'
              : '当前为实地探索，到达点位附近后使用定位开启剧情。'}
          </p>
        </aside>
      </div>
    </div>
  )
}
