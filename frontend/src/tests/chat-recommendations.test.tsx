import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useJourney } from '@/engine/journeyStore'
import ChatPage from '@/pages/ChatPage'
import type { ExplorationActivity } from '@/types'

const original = useJourney.getState()
const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo')
const sendChat = vi.fn()
const sendSceneChat = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() })
  useJourney.setState({
    ...original, state: 'AT_SPOT', currentSpotId: 'pingjiang', busy: false,
    npcs: [{ id: 'zhou-bo', name: '周伯', title: '守桥人', spotId: 'pingjiang', personality: [], greeting: '请看河街。', knowledgeScope: '平江街巷', personaPrompt: '', isFictional: true }],
    spots: [{ id: 'pingjiang', name: '平江路', shortName: '平江', order: 1, lat: 31, lng: 120, triggerRadiusM: 100, intro: '', story: '', taskIds: [], codexIds: [], npcId: 'zhou-bo' }],
    activities: [{ id: 'exploration', spotId: 'pingjiang', npcId: 'zhou-bo', hintQuestion: '请给我水巷手札的剧情提示。', npcHintObtained: false, progress: { status: 'available', attempts: 0, score: 0 } } as ExplorationActivity],
    sendChat, sendSceneChat,
  })
})
afterEach(() => {
  cleanup(); useJourney.setState(original, true)
  if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo)
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo')
})
function mount() {
  render(<RouterProvider router={createMemoryRouter([{ path: '/chat/:npcId', element: <ChatPage /> }], { initialEntries: ['/chat/zhou-bo'] })} />)
}
it('主题筛选与 GitHub 探索提示同时可用', () => {
  mount()
  expect(screen.getByRole('button', { name: '《平江图》是什么？' })).toBeInTheDocument()
  fireEvent.change(screen.getByRole('combobox', { name: '推荐问题主题' }), { target: { value: '史实辨析' } })
  expect(screen.getByRole('button', { name: '“《雨巷》写的就是丁香巷”有可靠定论吗？' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '可选探索：请给我水巷手札的剧情提示。' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '《平江图》是什么？' })).not.toBeInTheDocument()
})
it('完成后对话只读，隐藏推荐问题和探索提示并阻止强制表单提交', () => {
  useJourney.setState({ state: 'COMPLETED' })
  mount()
  const input = screen.getByRole('textbox', { name: '向周伯提问' })
  expect(input).toBeDisabled()
  expect(screen.queryByRole('combobox', { name: '推荐问题主题' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /可选探索：/ })).not.toBeInTheDocument()
  fireEvent.change(input, { target: { value: '继续故事' } })
  fireEvent.submit(input.closest('form')!)
  expect(sendChat).not.toHaveBeenCalled()
  expect(sendSceneChat).not.toHaveBeenCalled()
})
