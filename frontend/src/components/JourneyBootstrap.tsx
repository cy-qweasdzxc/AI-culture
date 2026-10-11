import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useJourney } from '@/engine/journeyStore'

export default function JourneyBootstrap({ children }: { children: ReactNode }) {
  const ready = useJourney((s) => s.ready)
  const loading = useJourney((s) => s.loading)
  const error = useJourney((s) => s.error)
  const restore = useJourney((s) => s.restore)
  useEffect(() => {
    void restore()
  }, [restore])
  if (!ready)
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-serif text-2xl text-ink">城迹入戏</h1>
        <p className="mt-4 text-sm text-bluegray" role={error ? 'alert' : 'status'}>
          {error ?? '正在恢复服务端旅程…'}
        </p>
        {error && !loading ? (
          <button className="btn-primary mt-4" onClick={() => void restore()}>
            重新连接
          </button>
        ) : null}
      </main>
    )
  return (
    <>
      {error ? (
        <div
          className="border-b border-warning bg-warning/10 px-4 py-3 text-sm text-ink"
          role="alert"
        >
          {error}{' '}
          <button
            className="underline"
            onClick={() =>
              void useJourney
                .getState()
                .refresh()
                .catch(() => undefined)
            }
          >
            刷新旅程
          </button>
        </div>
      ) : null}
      {children}
    </>
  )
}
