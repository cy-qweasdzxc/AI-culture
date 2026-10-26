import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ActivityCard } from '@/components/ExplorationPanel'
import { useJourney } from '@/engine/journeyStore'
import type { ExplorationActivity } from '@/types'

vi.mock('@/components/SpotMedia', () => ({ default: () => <p>照片与许可</p> }))
const original = useJourney.getState()
const verify = vi.fn().mockResolvedValue({ ok: false, feedback: '请核对给定材料', awardedScore: 0, awardedClues: [], unlockedCodex: [] })
const activity: ExplorationActivity = {
  id: 'test-exploration', spotId: 'pingjiang', title: '观察手札', mechanism: 'ordering', contentKind: 'fiction', publication: 'demo',
  version: 1, briefing: '先取信，再看桥', readingGuide: '慢慢读', sourceLabel: '虚构手札', difficulty: 'normal', audienceMode: 'adult', score: 8,
  items: [{ id: 'b', label: '看桥' }, { id: 'a', label: '取信' }], targets: [], evidence: [], statements: [], hint: '按先后顺序', photo: false,
  needsEvidenceLinks: false, needsNpcHint: false, npcHintObtained: false, progress: { status: 'available', attempts: 0, score: 0 },
}
beforeEach(() => {
  verify.mockClear()
  useJourney.setState({ ...original, busy: false, state: 'AT_SPOT', activities: [], verifyActivity: verify })
})
afterEach(() => { cleanup(); useJourney.setState(original, true) })
function mount(a = activity) {
  const result = render(<MemoryRouter><ActivityCard activity={a} /></MemoryRouter>)
  fireEvent.click(screen.getByText(/观察手札 · 可选探索/))
  return result
}
it('排序使用可触控按钮且错误反馈不重置排列', async () => {
  mount()
  fireEvent.click(screen.getByRole('button', { name: '上移取信' }))
  fireEvent.click(screen.getByRole('button', { name: '提交探索' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('请核对给定材料')
  expect(verify).toHaveBeenCalledWith(activity.id, ['a', 'b'])
  expect(within(screen.getByRole('list', { name: '探索排序列表' })).getAllByRole('listitem')[0]).toHaveTextContent('取信')
})
it('匹配必须全部选择且不能重复使用同一目标', async () => {
  mount({ ...activity, mechanism: 'matching', targets: [{ id: 'x', label: '桥边' }, { id: 'y', label: '信桌' }] })
  const selects = screen.getAllByRole('combobox')
  fireEvent.change(selects[0], { target: { value: 'x' } })
  fireEvent.change(selects[1], { target: { value: 'x' } })
  expect(screen.getByRole('button', { name: '提交探索' })).toBeDisabled()
  fireEvent.change(selects[1], { target: { value: 'y' } })
  fireEvent.click(screen.getByRole('button', { name: '提交探索' }))
  await screen.findByRole('alert')
  expect(verify).toHaveBeenCalledWith(activity.id, { b: 'x', a: 'y' })
})
it('深入证据题需要为已选判断指定依据', async () => {
  mount({ ...activity, mechanism: 'evidence', difficulty: 'advanced', needsEvidenceLinks: true,
    statements: [{ id: 'visible', label: '能看到水面' }], evidence: [{ id: 'photo', label: '水面与船只' }] })
  fireEvent.click(screen.getByRole('checkbox', { name: '能看到水面' }))
  expect(screen.getByRole('button', { name: '提交探索' })).toBeDisabled()
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'photo' } })
  fireEvent.click(screen.getByRole('button', { name: '提交探索' }))
  await screen.findByRole('alert')
  expect(verify).toHaveBeenCalledWith(activity.id, { selected: ['visible'], supports: { visible: 'photo' } })
})
it('NPC 前置缺失时保持任务可见并引导主动提问', () => {
  mount({ ...activity, needsNpcHint: true, npcId: 'a-heng', hintQuestion: '请给我剧情提示。' })
  expect(screen.getByRole('button', { name: '提交探索' })).toBeDisabled()
  expect(screen.getByRole('link', { name: /询问剧情线索/ })).toHaveAttribute('href', '/chat/a-heng')
})
it('刷新后的完成记录与服务端分值只读显示', () => {
  render(<MemoryRouter><ActivityCard activity={{ ...activity, progress: { status: 'completed', attempts: 2, score: 8, answer: ['a','b'] }, explanation: '遵循约束' }} /></MemoryRouter>)
  fireEvent.click(screen.getByText('观察手札 · 已完成'))
  expect(screen.getByRole('status')).toHaveTextContent('8 探索积分')
  expect(screen.queryByRole('button', { name: '提交探索' })).not.toBeInTheDocument()
})
it('旧旅程没有探索状态时使用空目录，结束旅程不能补领奖励', () => {
  useJourney.setState({ state: 'COMPLETED', activityStates: {} })
  mount()
  expect(screen.queryByRole('button', { name: '提交探索' })).not.toBeInTheDocument()
  expect(screen.getByText(/未完成可选探索不会改变原结局/)).toBeVisible()
})
