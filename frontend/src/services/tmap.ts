interface TMapLatLng {
  getLat(): number
  getLng(): number
}

export interface TMapNS {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => TMapMap
  LatLng: new (lat: number, lng: number) => TMapLatLng
  MultiMarker: new (opts: Record<string, unknown>) => {
    setGeometries(g: unknown[]): void
    on(e: string, cb: (evt: { geometry?: { id?: string } }) => void): void
    off?(e: string, cb: (evt: { geometry?: { id?: string } }) => void): void
    setMap?(map: null): void
  }
  MultiPolyline: new (opts: Record<string, unknown>) => { setMap?(map: null): void }
  MarkerStyle: new (opts: Record<string, unknown>) => object
  PolylineStyle: new (opts: Record<string, unknown>) => object
}

export interface TMapMap {
  setCenter(c: TMapLatLng): void
  setZoom(z: number): void
  resize?(): void
  destroy(): void
  on(e: string, cb: () => void): void
}

declare global {
  interface Window {
    TMap?: TMapNS
    _TMapSecurityConfig?: { serviceHost: string }
  }
}

let loaderPromise: Promise<void> | null = null

export function loadTMap(): Promise<void> {
  if (window.TMap) return Promise.resolve()
  if (loaderPromise) return loaderPromise
  const key = import.meta.env.VITE_TMAP_KEY as string | undefined
  if (!key) return Promise.reject(new Error('未配置地图密钥'))
  const existing = [...document.scripts].find((script) => {
    try { const url = new URL(script.src); return url.origin === 'https://map.qq.com' && url.pathname === '/api/gljs' }
    catch { return false }
  })
  const script = existing ?? document.createElement('script')
  const promise = new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      window.clearTimeout(timeout)
      script.removeEventListener('load', loaded)
      script.removeEventListener('error', failed)
      if (error) { script.remove(); reject(error) }
      else resolve()
    }
    const loaded = () => finish(window.TMap ? undefined : new Error('在线地图 SDK 未能就绪'))
    const failed = () => finish(new Error('在线地图 SDK 加载失败'))
    const timeout = window.setTimeout(() => finish(new Error('在线地图加载超时')), 10000)
    script.addEventListener('load', loaded, { once: true })
    script.addEventListener('error', failed, { once: true })
    if (!existing) {
      script.async = true
      script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(key)}`
      document.head.appendChild(script)
    }
  })
  loaderPromise = promise.catch((error: unknown) => {
    loaderPromise = null
    throw error
  })
  return loaderPromise
}
