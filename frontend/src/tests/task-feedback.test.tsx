import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useJourney } from '@/engine/journeyStore'
import TaskPage from '@/pages/TaskPage'
import type { PublicTask } from '@/types'

const original = useJourney.getState()
const task: PublicTask = {
  id: 'sorting', spotId: 'pingjiang', type: 'sorting', title: '测试排序', briefing: '调整顺序',
  knowledgeScore: 10, sortingItems: ['甲', '乙', '丙'],
}
const verify = vi.fn(async () => {
  // A successful API exchange refreshes catalog objects even when the answer is wrong.
  useJourney.setState({ tasks: [structuredClone(task), { ...task, id: 'second' }] })
  return { ok: false, feedback: '顺序不对，请再观察。' }
})

beforeEach(() => {
  verify.mockClear()
  useJourney.setState({ ...original, tasks: [task, { ...task, id: 'second' }],
    taskStates: { sorting: { status: 'available', attempts: 0, score: 0 } },
    spots: [], clues: [], inventory: [], busy: false, verifyTask: verify })
})
afterEach(() => { cleanup(); useJourney.setState(original, true) })

function mount() {
  const router = createMemoryRouter([{ path: '/task/:taskId', element: <TaskPage /> }],
    { initialEntries: ['/task/sorting'] })
  render(<RouterProvider router={router} />)
  return router
}

async function submitWrongOrder() {
  fireEvent.click(screen.getByRole('button', { name: '下移第 1 项' }))
  fireEvent.click(screen.getByRole('button', { name: '提交答案' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('顺序不对')
}

it('排序答错后目录刷新仍保留排列与错误反馈', async () => {
  mount()
  await submitWrongOrder()
  expect(verify).toHaveBeenCalledWith('sorting', [1, 0, 2])
  const rows = within(screen.getByRole('list', { name: /排序列表/ })).getAllByRole('listitem')
  expect(rows[0]).toHaveTextContent('乙')
  expect(rows[1]).toHaveTextContent('甲')
})

it('切换题目会重置上题答案与反馈', async () => {
  const router = mount()
  await submitWrongOrder()
  await act(() => router.navigate('/task/second'))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(within(screen.getByRole('list', { name: /排序列表/ })).getAllByRole('listitem')[0]).toHaveTextContent('甲')
})

it('同题选项实际变化时初始化新题内容', async () => {
  mount()
  await submitWrongOrder()
  act(() => useJourney.setState({ tasks: [{ ...task, sortingItems: ['丁', '戊'] }] }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  const rows = within(screen.getByRole('list', { name: /排序列表/ })).getAllByRole('listitem')
  expect(rows).toHaveLength(2)
  expect(rows[0]).toHaveTextContent('丁')
})
