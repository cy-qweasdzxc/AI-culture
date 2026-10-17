import { useEffect } from 'react'
import type { ReactNode } from 'react'
import Icon from '@/components/Icon'
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
      <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-8 sm:px-8">
        <div className="flex items-center gap-3">
          <span className="brand-mark" aria-hidden>
            城迹
          </span>
          <h1 className="font-serif text-xl font-bold text-ink">城迹入戏</h1>
        </div>
        <div className="my-auto grid items-center gap-10 py-12 md:grid-cols-2">
          <div>
            <Icon name={error ? 'compass' : 'book'} className="mb-6 h-8 w-8 text-cinnabar" />
            <h2 className="font-serif text-3xl font-bold leading-relaxed text-ink">
              {error ? '故事还在，稍后再试一次。' : '正在翻开你的城市故事。'}
            </h2>
            <p
              className="mt-4 max-w-sm text-sm leading-7 text-ink-soft"
              role={error ? 'alert' : 'status'}
            >
              {error ?? '正在恢复服务端旅程…'}
            </p>
            {error && !loading && (
              <button className="btn-primary mt-6" onClick={() => void restore()}>
                重新连接
                <Icon name="arrow" className="h-4 w-4" />
              </button>
            )}
          </div>
          <div aria-hidden="true" className="hidden space-y-5 md:block">
            <div className="h-72 rounded-xl bg-paper-deep" />
            <div className="h-4 w-3/4 rounded bg-paper-deep" />
            <div className="h-4 w-1/2 rounded bg-paper-deep" />
          </div>
        </div>
      </main>
    )
  return (
    <>
      {error && (
        <div
          className="flex flex-wrap items-center justify-center gap-3 border-b border-warning/40 bg-warning/10 px-5 py-2 text-sm text-ink"
          role="alert"
        >
          <span>{error}</span>
          <button
            className="min-h-11 font-medium text-cinnabar underline underline-offset-4"
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
      )}
      {children}
    </>
  )
}
