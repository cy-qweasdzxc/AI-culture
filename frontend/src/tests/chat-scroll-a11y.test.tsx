import { cleanup, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useJourney } from '@/engine/journeyStore'
import ChatPage from '@/pages/ChatPage'

const original = useJourney.getState()
const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo')

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() })
  useJourney.setState({
    ...original,
    state: 'AT_SPOT',
    currentSpotId: 'pingjiang',
    busy: false,
    npcs: [
      {
        id: 'zhou-bo',
        name: '周伯',
        title: '守桥人',
        spotId: 'pingjiang',
        personality: [],
        greeting: '请看河街。',
        knowledgeScope: '平江街巷',
        personaPrompt: '',
        isFictional: true,
      },
    ],
    spots: [
      {
        id: 'pingjiang',
        name: '平江路',
        shortName: '平江',
        order: 1,
        lat: 31,
        lng: 120,
        triggerRadiusM: 100,
        intro: '',
        story: '',
        taskIds: [],
        codexIds: [],
        npcId: 'zhou-bo',
      },
    ],
    messages: {
      'zhou-bo': [
        { id: 'm-user', from: 'user', text: '平江路有什么故事？', at: 1 },
        { id: 'm-npc', from: 'npc', npcId: 'zhou-bo', text: '前面就是水巷。', at: 2 },
      ],
    },
  })
})

afterEach(() => {
  cleanup()
  useJourney.setState(original, true)
  if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo)
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo')
})

function mount() {
  render(
    <RouterProvider
      router={createMemoryRouter([{ path: '/chat/:npcId', element: <ChatPage /> }], {
        initialEntries: ['/chat/zhou-bo'],
      })}
    />,
  )
}

describe('chat transcript scroll region', () => {
  it('exposes the scrollable message list as a named, keyboard-focusable log', () => {
    mount()

    const log = screen.getByRole('log', { name: '对话消息' })
    expect(log).toHaveAttribute('tabindex', '0')
    expect(log).toHaveAttribute('aria-live', 'polite')
    expect(log).toHaveClass('overflow-y-auto')
    expect(log).toHaveClass('focus-visible:outline')
    expect(log).toHaveTextContent('平江路有什么故事？')
    expect(log).toHaveTextContent('前面就是水巷。')

    log.focus()
    expect(log).toHaveFocus()
  })
})
