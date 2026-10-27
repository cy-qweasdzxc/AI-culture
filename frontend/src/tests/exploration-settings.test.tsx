import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it } from 'vitest'
import SettingsPage from '@/pages/SettingsPage'
import { useJourney } from '@/engine/journeyStore'

const original = useJourney.getState()
beforeEach(() => useJourney.setState({ ...original, state: 'AT_SPOT', busy: false, taskStates: {}, activityStates: {} }))
afterEach(() => { cleanup(); useJourney.setState(original, true) })
const mount = () => render(<MemoryRouter><SettingsPage /></MemoryRouter>)
it('仅尝试可选探索后设置页也锁定难度', () => {
  useJourney.setState({ activityStates: { example: { status: 'available', attempts: 1, score: 0 } } })
  mount()
  expect(screen.getByLabelText('任务难度', { exact: true })).toBeDisabled()
  expect(screen.getByLabelText('表达模式', { exact: true })).toBeEnabled()
})
it('没有答题记录的旧旅程仍可更改难度', () => {
  mount()
  expect(screen.getByLabelText('任务难度', { exact: true })).toBeEnabled()
})
it('已完成可选探索的难度保持锁定', () => {
  useJourney.setState({ activityStates: { example: { status: 'completed', attempts: 1, score: 8 } } })
  mount()
  expect(screen.getByLabelText('任务难度', { exact: true })).toBeDisabled()
})
