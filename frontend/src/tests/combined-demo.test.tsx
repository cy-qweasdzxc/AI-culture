import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useJourney } from '@/engine/journeyStore'
import DemoPage from '@/pages/DemoPage'
import RolePage from '@/pages/RolePage'
import type { Role } from '@/types'

const original = useJourney.getState()
const role: Role = { id: 'scholar', name: '沈砚', identity: '虚构书生', tagline: '', description: '', perk: '', storyEffect: '', personaPrompt: '', startClueId: '', isFictional: true }
const resetJourney = vi.fn()
const startJourney = vi.fn()
const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal')
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close')
beforeEach(() => {
  vi.clearAllMocks(); resetJourney.mockResolvedValue(undefined); startJourney.mockResolvedValue(undefined)
  useJourney.setState({ ...original, ready: true, state: 'CREATED', roles: [role], journeyId: null, busy: false, resetJourney, startJourney })
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.open = true } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new Event('close')) } })
})
afterEach(() => {
  cleanup(); useJourney.setState(original, true); vi.restoreAllMocks()
  for (const [name, descriptor] of [['showModal', originalShowModal], ['close', originalClose]] as const) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor)
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name)
  }
})
function mount(element: React.ReactNode) {
  const router = createMemoryRouter([{ path: '/', element }, { path: '/map', element: <p>已有路线地图</p> }], { initialEntries: ['/'] })
  render(<RouterProvider router={router} />)
  return router
}

it('the independent demo starts a named virtual route with the selected senior profile', async () => {
  mount(<DemoPage />)
  fireEvent.change(screen.getByLabelText('演示人群'), { target: { value: 'senior' } })
  expect(screen.getByLabelText('演示难度')).toHaveValue('easy')
  fireEvent.click(screen.getByRole('button', { name: '开始苏州经典演示' }))
  await waitFor(() => expect(startJourney).toHaveBeenCalledWith('scholar', 'virtual', { audience_mode: 'senior', difficulty: 'easy', route_id: 'suzhou-classic' }))
  expect(resetJourney).not.toHaveBeenCalled()
})

it('opening and continuing the demo entry preserves a non-default existing journey', async () => {
  useJourney.setState({ state: 'AT_SPOT', journeyId: 'existing', routeId: 'other-existing-route' })
  const router = mount(<DemoPage />)
  expect(resetJourney).not.toHaveBeenCalled(); expect(startJourney).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('link', { name: '继续已有旅程' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/map'))
  expect(useJourney.getState().routeId).toBe('other-existing-route')
  expect(resetJourney).not.toHaveBeenCalled(); expect(startJourney).not.toHaveBeenCalled()
})

it('restart can be cancelled and only confirmed restart resets the old journey', async () => {
  useJourney.setState({ state: 'AT_SPOT', journeyId: 'existing', routeId: 'other-existing-route' })
  mount(<DemoPage />)
  fireEvent.click(screen.getByRole('button', { name: '重新开始苏州经典演示' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('其他城市或路线的进度也会被替换')
  expect(resetJourney).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '保留当前旅程' }))
  expect(resetJourney).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '重新开始苏州经典演示' }))
  fireEvent.click(screen.getByRole('button', { name: '确认重新开始演示' }))
  await waitFor(() => expect(startJourney).toHaveBeenCalledOnce())
  expect(resetJourney).toHaveBeenCalledOnce()
  expect(resetJourney.mock.invocationCallOrder[0]).toBeLessThan(startJourney.mock.invocationCallOrder[0])
})

it('four audience cards retain student mode and send senior without replacing its identity', async () => {
  mount(<RolePage />)
  for (const name of ['儿童模式', '学生模式', '成人模式', '老人模式']) expect(screen.getByRole('radio', { name })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('radio', { name: '老人模式' }))
  expect(screen.getByLabelText('任务难度')).toHaveValue('easy')
  fireEvent.click(screen.getByRole('radio', { name: /沈砚/ }))
  fireEvent.click(screen.getByRole('button', { name: '创建旅程，开始体验' }))
  await waitFor(() => expect(startJourney).toHaveBeenCalledWith('scholar', 'virtual', { audience_mode: 'senior', difficulty: 'easy', route_id: 'suzhou-classic' }))
})
