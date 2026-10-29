import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import BackgroundMusic from '@/components/BackgroundMusic'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
function audio(play = vi.fn().mockResolvedValue(undefined)) {
  const instance = { play, pause: vi.fn(), load: vi.fn(), removeAttribute: vi.fn(), canPlayType: vi.fn().mockReturnValue('probably'), src: '', onpause: null, onerror: null }
  const create = vi.fn(function () { return instance }); vi.stubGlobal('Audio', create)
  return { instance, create }
}
it('does not create audio or autoplay before a gesture and cleans it up on unmount', async () => {
  const { instance, create } = audio(); const { unmount } = render(<BackgroundMusic />)
  expect(create).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '开启古琴背景音乐' }))
  expect(await screen.findByRole('button', { name: '关闭古琴背景音乐' })).toHaveAttribute('aria-pressed', 'true')
  expect(instance.play).toHaveBeenCalledTimes(1)
  unmount(); expect(instance.pause).toHaveBeenCalled(); expect(instance.removeAttribute).toHaveBeenCalledWith('src')
})
it('handles denied playback and retries only after another user gesture', async () => {
  const play = vi.fn().mockRejectedValueOnce(new Error('NotAllowedError')).mockResolvedValueOnce(undefined); audio(play)
  render(<BackgroundMusic />); fireEvent.click(screen.getByRole('button', { name: '开启古琴背景音乐' }))
  expect(await screen.findByRole('status')).toHaveTextContent('音乐未能播放')
  expect(play).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: '开启古琴背景音乐' }))
  await screen.findByRole('button', { name: '关闭古琴背景音乐' }); expect(play).toHaveBeenCalledTimes(2)
})
it('late play resolution cannot leave an orphaned sound after unmount', async () => {
  let finish!: () => void
  const { instance } = audio(vi.fn(() => new Promise<void>((r) => { finish = r })))
  const { unmount } = render(<BackgroundMusic />); fireEvent.click(screen.getByRole('button', { name: '开启古琴背景音乐' })); unmount(); finish()
  await waitFor(() => expect(instance.pause.mock.calls.length).toBeGreaterThanOrEqual(2))
})
it('unsupported audio remains optional and exposes original attribution', async () => {
  const { instance } = audio(); instance.canPlayType.mockReturnValue('')
  render(<BackgroundMusic />); fireEvent.click(screen.getByRole('button', { name: '开启古琴背景音乐' }))
  expect(await screen.findByRole('status')).toHaveTextContent('此浏览器暂不支持')
  expect(instance.play).not.toHaveBeenCalled()
  const details = screen.getByText('音乐来源与许可').closest('details')!; details.open = true
  expect(screen.getByRole('link', { name: 'CC BY-SA 3.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/3.0/')
})
