import { useEffect, useRef, useState } from 'react'
import type { AudienceMode } from '@/types'

export default function AudioGuide({ locationId, text, audience = 'adult' }: { locationId: string; text: string; audience?: AudienceMode }) {
  const supported = typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined'
  const [status, setStatus] = useState<'idle' | 'playing' | 'paused' | 'error'>('idle')
  const defaultRate = audience === 'child' || audience === 'senior' ? 0.75 : 1
  const [rate, setRate] = useState(defaultRate)
  const active = useRef<SpeechSynthesisUtterance | null>(null)
  const narration = audience === 'child' ? (text.match(/[^。！？.!?]+[。！？.!?]?/g) ?? [text]).slice(0, 2).join('') : text
  useEffect(() => { setRate(defaultRate) }, [defaultRate])
  useEffect(() => {
    const stop = () => {
      if (active.current) { active.current = null; window.speechSynthesis?.cancel() }
      setStatus('idle')
    }
    const hide = () => { if (document.visibilityState === 'hidden') stop() }
    document.addEventListener('visibilitychange', hide)
    return () => { document.removeEventListener('visibilitychange', hide); stop() }
  }, [locationId, narration, audience])
  function stop() {
    active.current = null
    window.speechSynthesis?.cancel()
    setStatus('idle')
  }
  function play() {
    if (!supported || !narration.trim()) return
    stop()
    const utterance = new SpeechSynthesisUtterance(narration)
    active.current = utterance
    utterance.lang = 'zh-CN'
    utterance.rate = rate
    const voice = window.speechSynthesis.getVoices().find((item) => item.lang.toLowerCase().startsWith('zh'))
    if (voice) utterance.voice = voice
    utterance.onend = () => { if (active.current === utterance) { active.current = null; setStatus('idle') } }
    utterance.onerror = () => { if (active.current === utterance) { active.current = null; setStatus('error') } }
    try { window.speechSynthesis.speak(utterance); setStatus('playing') } catch { active.current = null; setStatus('error') }
  }
  return <section className="play-audio-panel mt-6 rounded-xl border border-line bg-surface p-4" aria-label="语音讲解">
    <div className="flex items-start gap-3"><span className="play-feature-icon" aria-hidden>🔊</span><h2 className="font-semibold">语音讲解</h2></div>
    <p className="mt-2 text-xs leading-6 text-bluegray">朗读下方现有介绍，剧情文字明确标为虚构；儿童模式只读简短介绍。浏览器提供语音，需主动点击。离开页面或切入后台后停止。</p>
    {!supported ? <p role="status" className="mt-2 text-sm">当前浏览器不支持语音，请阅读讲解文本。</p> : <div className="mt-3 flex flex-wrap items-center gap-2">
      <button className="btn-primary" onClick={play} disabled={!narration.trim()}>播放讲解</button>
      <span className="rounded-full border border-line bg-paper-deep px-3 py-2 text-sm" aria-live="polite">{rate === 0.75 ? '慢速' : rate === 1 ? '正常' : '加速'} {rate}×</span>
      <button className="btn-ghost" disabled={status !== 'playing' && status !== 'paused'} onClick={() => {
        if (status === 'paused') { window.speechSynthesis.resume(); setStatus('playing') }
        else { window.speechSynthesis.pause(); setStatus('paused') }
      }}>{status === 'paused' ? '继续' : '暂停'}</button>
      <button className="btn-ghost" onClick={stop} disabled={status === 'idle'}>停止</button>
      <label className="flex min-h-11 items-center gap-2 text-sm">语速
        <select aria-label="讲解语速" className="rounded border border-line bg-surface p-2" value={rate} onChange={(event) => { stop(); setRate(Number(event.target.value)) }}>
          <option value={0.75}>0.75 倍</option><option value={1}>1 倍</option><option value={1.25}>1.25 倍</option><option value={1.5}>1.5 倍</option>
        </select>
      </label>
    </div>}
    {status === 'error' && <p role="status" className="mt-2 text-sm">语音暂不可用，可重试或阅读文本。移动浏览器请确认声音及语音设置。</p>}
    <details className="mt-3 text-sm"><summary className="min-h-11 cursor-pointer leading-[44px]">讲解文本</summary><p className="whitespace-pre-wrap leading-7">{narration}</p></details>
  </section>
}
