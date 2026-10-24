import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import AudioGuide from '@/components/AudioGuide'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
function mockSpeech() {
  const synth = { speak:vi.fn(), cancel:vi.fn(), pause:vi.fn(), resume:vi.fn(), getVoices:()=>[] }
  vi.stubGlobal('speechSynthesis', synth)
  vi.stubGlobal('SpeechSynthesisUtterance', class { text:string; constructor(text:string) {this.text=text} })
  return synth
}
test('speech requires a gesture, pauses, resumes, changes rate and stops on navigation', () => {
  const synth = mockSpeech()
  const { rerender, unmount } = render(<AudioGuide locationId="a" text="第一句。第二句。第三句。" audience="child" />)
  expect(synth.speak).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'播放讲解'}))
  expect(synth.speak.mock.calls[0][0].text).toBe('第一句。第二句。')
  fireEvent.click(screen.getByRole('button',{name:'暂停'}))
  expect(synth.pause).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button',{name:'继续'}))
  expect(synth.resume).toHaveBeenCalledOnce()
  fireEvent.change(screen.getByLabelText('讲解语速'), {target:{value:'1.25'}})
  fireEvent.click(screen.getByRole('button',{name:'播放讲解'}))
  expect(synth.speak.mock.calls[1][0].rate).toBe(1.25)
  rerender(<AudioGuide locationId="b" text="新的介绍。" />)
  expect(screen.getByRole('button',{name:'暂停'})).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'播放讲解'}))
  const count = synth.cancel.mock.calls.length
  unmount()
  expect(synth.cancel.mock.calls.length).toBe(count+1)
})
test('backgrounding stops an active utterance', () => {
  const synth = mockSpeech()
  render(<AudioGuide locationId="a" text="文本" />)
  fireEvent.click(screen.getByRole('button',{name:'播放讲解'}))
  const count = synth.cancel.mock.calls.length
  const visibility = vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden')
  fireEvent(document, new Event('visibilitychange'))
  expect(synth.cancel.mock.calls.length).toBe(count+1)
  visibility.mockRestore()
})
test('unsupported browsers retain the readable text', () => {
  vi.stubGlobal('speechSynthesis', undefined)
  render(<AudioGuide locationId="a" text="保留介绍。" />)
  expect(screen.getByRole('status')).toHaveTextContent('不支持语音')
  expect(screen.getByText('保留介绍。')).toBeInTheDocument()
})
