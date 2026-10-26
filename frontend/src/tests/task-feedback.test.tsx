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
  return mountAt('sorting')
}

function mountAt(taskId: string) {
  const router = createMemoryRouter([{ path: '/task/:taskId', element: <TaskPage /> }],
    { initialEntries: [`/task/${taskId}`] })
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

it('多选任务用复选框提交所选 key 数组', async () => {
  const multiTask: PublicTask = {
    id: 'multi', spotId: 'pingjiang', type: 'multi_select', title: '多选挑战',
    briefing: '选出所有符合的内容', knowledgeScore: 12, optional: true,
    options: [{ key: 'A', text: '第一项' }, { key: 'B', text: '第二项' }],
  }
  useJourney.setState({ tasks: [multiTask], taskStates: { multi: { status: 'available', attempts: 0, score: 0 } } })
  mountAt('multi')
  fireEvent.click(screen.getByRole('checkbox', { name: /第一项/ }))
  fireEvent.click(screen.getByRole('checkbox', { name: /第二项/ }))
  fireEvent.click(screen.getByRole('button', { name: '提交答案' }))
  expect(verify).toHaveBeenCalledWith('multi', ['A', 'B'])
})

it('配对任务逐项选择并以左到右映射提交', async () => {
  const matchingTask: PublicTask = {
    id: 'matching', spotId: 'pingjiang', type: 'matching', title: '配对挑战',
    briefing: '为线索找到对应内容', knowledgeScore: 12, optional: true,
    matchingLeft: [{ id: 'left-a', text: '线索甲' }, { id: 'left-b', text: '线索乙' }],
    matchingRight: [{ id: 'right-1', text: '内容一' }, { id: 'right-2', text: '内容二' }],
  }
  useJourney.setState({ tasks: [matchingTask], taskStates: { matching: { status: 'available', attempts: 0, score: 0 } } })
  mountAt('matching')
  fireEvent.change(screen.getByRole('combobox', { name: '为线索甲选择配对项' }), { target: { value: 'right-2' } })
  fireEvent.change(screen.getByRole('combobox', { name: '为线索乙选择配对项' }), { target: { value: 'right-1' } })
  fireEvent.click(screen.getByRole('button', { name: '提交答案' }))
  expect(verify).toHaveBeenCalledWith('matching', { 'left-a': 'right-2', 'left-b': 'right-1' })
})

it('观察题显示单选答案并提交', async () => {
  const observationTask: PublicTask = {
    id: 'observation', spotId: 'pingjiang', type: 'observation', title: '观察题',
    briefing: '观察现场后回答', knowledgeScore: 8,
    options: [{ key: 'A', text: '看到石桥' }, { key: 'B', text: '看到木桥' }],
  }
  useJourney.setState({ tasks: [observationTask], taskStates: { observation: { status: 'available', attempts: 0, score: 0 } } })
  mountAt('observation')
  fireEvent.click(screen.getByRole('radio', { name: /B.*看到木桥/ }))
  fireEvent.click(screen.getByRole('button', { name: '提交答案' }))
  expect(verify).toHaveBeenCalledWith('observation', 'B')
})

it('旅程结束后未完成的任务只可查看且不请求验证', () => {
  useJourney.setState({
    state: 'COMPLETED',
    tasks: [{
      id: 'finished-route', spotId: 'pingjiang', type: 'observation', title: '结束后不可提交',
      briefing: '题目仍可查看', knowledgeScore: 5,
      options: [{ key: 'A', text: '选项甲' }],
    }],
    taskStates: { 'finished-route': { status: 'available', attempts: 0, score: 0 } },
  })
  mountAt('finished-route')
  expect(screen.getByRole('status')).toHaveTextContent('本段旅程已结束')
  expect(screen.getByRole('radio', { name: /选项甲/ })).toBeDisabled()
  expect(screen.getByRole('button', { name: '提交答案' })).toBeDisabled()
  expect(screen.getByRole('link', { name: '开启新旅程' })).toHaveAttribute('href', '/role')
  expect(verify).not.toHaveBeenCalled()
})
