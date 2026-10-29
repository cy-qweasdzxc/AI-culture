import { useEffect, useRef, useState } from 'react'

export default function BackgroundMusic() {
  const audio = useRef<HTMLAudioElement | null>(null)
  const alive = useRef(true)
  const [enabled, setEnabled] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      if (audio.current) {
        audio.current.onpause = null; audio.current.onerror = null
        audio.current.pause(); audio.current.removeAttribute('src'); audio.current.load(); audio.current = null
      }
    }
  }, [])
  async function toggle() {
    setError('')
    if (enabled) { audio.current?.pause(); setEnabled(false); return }
    if (!audio.current) {
      const element = new Audio()
      element.preload = 'none'; element.loop = true; element.volume = 0.18
      element.onpause = () => { if (alive.current) setEnabled(false) }
      element.onerror = () => { if (alive.current) { setEnabled(false); setError('古琴音频暂不可用，游览可以继续。') } }
      audio.current = element
    }
    const element = audio.current
    if (!element.canPlayType('audio/ogg')) { setError('此浏览器暂不支持古琴音频，游览可以继续。'); return }
    element.src = '/assets/audio/guqin-yangguan-sandie.ogg'
    setPending(true)
    let timeout: number | undefined
    try {
      await Promise.race([element.play(), new Promise<never>((_resolve, reject) => {
        timeout = window.setTimeout(() => reject(new Error('playback timeout')), 10000)
      })])
      if (!alive.current || audio.current !== element) { element.pause(); return }
      setEnabled(true)
    } catch { element.pause(); if (alive.current) { setEnabled(false); setError('音乐未能播放，请再次点击重试；游览可以继续。') } }
    finally { window.clearTimeout(timeout); if (alive.current) setPending(false) }
  }
  return <section className="mt-5 min-w-0 border-t border-line pt-3" aria-label="古琴背景音乐">
    <button type="button" disabled={pending} aria-pressed={enabled} onClick={() => void toggle()} className="btn-secondary min-h-11 text-xs">
      {pending ? '正在开启古琴音乐…' : enabled ? '关闭古琴背景音乐' : '开启古琴背景音乐'}
    </button>
    {error && <p role="status" className="mt-2 text-xs leading-6">{error}</p>}
    <details className="mt-1 text-xs text-bluegray">
      <summary className="min-h-11 cursor-pointer py-3">音乐来源与许可</summary>
      <p className="leading-6">《阳关三叠》 · Charlie Huang（Charles R Tsua / CharlieHuang） · 2013 年录音。原始音频未修改，默认关闭。</p>
      <a className="inline-link mr-4 inline-flex min-h-11 items-center" href="https://commons.wikimedia.org/wiki/File:Guqin-Yangguan_Sandie.ogg" target="_blank" rel="noreferrer">音乐原始来源</a>
      <a className="inline-link inline-flex min-h-11 items-center" href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noreferrer">CC BY-SA 3.0</a>
    </details>
  </section>
}
