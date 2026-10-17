import { useEffect, useRef, useState } from 'react'

interface TypewriterTextProps {
  text: string
  animate?: boolean
  className?: string
  /** Called after each visible character so the chat list can follow the caret. */
  onProgress?: () => void
}

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Reveal already-validated text one character at a time.
 *
 * The full answer still arrives in one transactional response; this component only
 * controls how it is shown. That keeps the evidence checks on the server while the
 * conversation feels live. The full text remains available to screen readers from
 * the first frame, and reduced-motion users see it immediately.
 */
export default function TypewriterText({
  text,
  animate = false,
  className,
  onProgress,
}: TypewriterTextProps) {
  const canAnimate = animate && text.length > 0 && !reducedMotion()
  const [visible, setVisible] = useState(canAnimate ? 0 : text.length)
  const [typing, setTyping] = useState(canAnimate)
  const progressRef = useRef(onProgress)

  useEffect(() => {
    progressRef.current = onProgress
  }, [onProgress])

  useEffect(() => {
    if (!canAnimate) {
      setVisible(text.length)
      setTyping(false)
      return
    }
    let index = 0
    let timer = 0
    setVisible(0)
    setTyping(true)
    // Keep a long answer from turning into a ten-second wait, while staying
    // visibly slower than a single bulk render.
    const charDelay = Math.max(14, Math.min(26, Math.round(3600 / Math.max(1, text.length))))
    const tick = () => {
      index += 1
      setVisible(index)
      progressRef.current?.()
      if (index >= text.length) {
        setTyping(false)
        return
      }
      const char = text[index - 1]
      const pause = /[。！？!?]/.test(char)
        ? 140
        : /[，、；：,;:]/.test(char)
          ? 60
          : char === '\n'
            ? 90
            : charDelay
      timer = window.setTimeout(tick, pause)
    }
    timer = window.setTimeout(tick, 120)
    return () => window.clearTimeout(timer)
  }, [text, canAnimate])

  if (!canAnimate) {
    return <p className={className}>{text}</p>
  }

  return (
    <p className={className} aria-busy={typing || undefined}>
      <span aria-hidden="true">
        {text.slice(0, visible)}
        {typing ? <span className="ml-0.5 inline-block text-cinnabar/70">▍</span> : null}
      </span>
      <span className="sr-only select-none">{text}</span>
    </p>
  )
}
