import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TypewriterText from '@/components/TypewriterText'

const TEXT = '你好，世界。'
const originalMatchMedia = window.matchMedia

function visibleText(container: HTMLElement): string {
  return container.querySelector('p > span[aria-hidden="true"]')?.textContent ?? ''
}

describe('逐字显示', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    })
  })

  it('关闭动画时直接展示完整文本', () => {
    const { container } = render(<TypewriterText text={TEXT} />)
    expect(screen.getByText(TEXT)).toBeInTheDocument()
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
  })

  it('按字显示已校验的回答，完成后去掉光标', () => {
    const onProgress = vi.fn()
    const { container } = render(<TypewriterText text={TEXT} animate onProgress={onProgress} />)

    expect(visibleText(container)).toBe('▍')
    act(() => {
      vi.advanceTimersByTime(120)
    })
    expect(visibleText(container)).toBe('你▍')
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(visibleText(container)).toBe(TEXT)
    expect(onProgress).toHaveBeenCalledTimes(TEXT.length)
  })

  it('屏幕阅读器从第一帧就能拿到完整回答', () => {
    const { container } = render(<TypewriterText text={TEXT} animate />)
    expect(container.querySelector('.sr-only')).toHaveTextContent(TEXT)
  })

  it('减少动态效果时立即显示完整文本', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    })
    const { container } = render(<TypewriterText text={TEXT} animate />)
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
    expect(screen.getByText(TEXT)).toBeInTheDocument()
  })
})
