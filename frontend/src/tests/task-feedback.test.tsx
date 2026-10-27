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
  expect(verify).toHaveBeenCalledWith('sorting', [1, 2, 0])
  const rows = within(screen.getByRole('list', { name: /排序列表/ })).getAllByRole('listitem')
  expect(rows[0]).toHaveTextContent('乙')
  expect(rows[1]).toHaveTextContent('丙')
  expect(rows[2]).toHaveTextContent('甲')
})

it('倒序兜底时可以从下往上还原为原始索引并提交', async () => {
  mount()
  const rows = () => within(screen.getByRole('list', { name: /排序列表/ })).getAllByRole('listitem')
  expect(rows().map((row) => row.textContent)).toEqual([
    expect.stringContaining('丙'),
    expect.stringContaining('乙'),
    expect.stringContaining('甲'),
  ])
  fireEvent.click(screen.getByRole('button', { name: '上移第 3 项' }))
  fireEvent.click(screen.getByRole('button', { name: '上移第 2 项' }))
  fireEvent.click(screen.getByRole('button', { name: '上移第 3 项' }))
  expect(rows().map((row) => row.textContent)).toEqual([
    expect.stringContaining('甲'),
    expect.stringContaining('乙'),
    expect.stringContaining('丙'),
  ])
  fireEvent.click(screen.getByRole('button', { name: '提交答案' }))
  await screen.findByRole('alert')
  expect(verify).toHaveBeenCalledWith('sorting', [0, 1, 2])
})

it('切换题目会重置上题答案与反馈', async () => {
  const router = mount()
  await submitWrongOrder()
  await act(() => router.navigate('/task/second'))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(within(screen.getByRole('list', { name: /排序列表/ })).getAllByRole('listitem')[0]).toHaveTextContent('丙')
})

it('同题选项实际变化时初始化新题内容', async () => {
  mount()
  await submitWrongOrder()
  act(() => useJourney.setState({ tasks: [{ ...task, sortingItems: ['丁', '戊'] }] }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  const rows = within(screen.getByRole('list', { name: /排序列表/ })).getAllByRole('listitem')
  expect(rows).toHaveLength(2)
  expect(rows[0]).toHaveTextContent('戊')
})

it('优先使用服务端给出的排序初始顺序', () => {
  useJourney.setState({ tasks: [{ ...task, initialOrder: [1, 2, 0] }] })
  mount()
  const rows = within(screen.getByRole('list', { name: /排序列表/ })).getAllByRole('listitem')
  expect(rows[0]).toHaveTextContent('乙')
  expect(rows[1]).toHaveTextContent('丙')
  expect(rows[2]).toHaveTextContent('甲')
})

it('多选挑战提交选中集合，完成旅程后不再显示提交入口', async () => {
  useJourney.setState({ tasks: [{ ...task, type: 'multi_select', optional: true, options: [{ key: 'a', text: '河道' }, { key: 'b', text: '街巷' }] }] })
  mount()
  fireEvent.click(screen.getByRole('checkbox', { name: /河道/ }))
  fireEvent.click(screen.getByRole('checkbox', { name: /街巷/ }))
  fireEvent.click(screen.getByRole('button', { name: '提交答案' }))
  await screen.findByRole('alert')
  expect(verify).toHaveBeenCalledWith('sorting', ['a', 'b'])
  act(() => useJourney.setState({ state: 'COMPLETED' }))
  expect(screen.queryByRole('button', { name: '提交答案' })).not.toBeInTheDocument()
  expect(screen.getByText(/旅程已结束/)).toBeInTheDocument()
})

it('配对挑战必须完整且不重复使用目标，提交 id 映射', async () => {
  useJourney.setState({ tasks: [{ ...task, type: 'matching', optional: true,
    matchingLeft: [{ id: 'water', text: '河' }, { id: 'street', text: '街' }],
    matchingRight: [{ id: 'travel', text: '行舟' }, { id: 'walk', text: '步行' }] }] })
  mount()
  const selects = screen.getAllByRole('combobox')
  fireEvent.change(selects[0], { target: { value: 'travel' } })
  fireEvent.change(selects[1], { target: { value: 'travel' } })
  expect(screen.getByRole('button', { name: '提交答案' })).toBeDisabled()
  fireEvent.change(selects[1], { target: { value: 'walk' } })
  fireEvent.click(screen.getByRole('button', { name: '提交答案' }))
  await screen.findByRole('alert')
  expect(verify).toHaveBeenCalledWith('sorting', { water: 'travel', street: 'walk' })
})
