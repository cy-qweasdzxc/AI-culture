import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useJourney } from '@/engine/journeyStore'
import ReportPage from '@/pages/ReportPage'
import SpotPage from '@/pages/SpotPage'
import MapPage from '@/pages/MapPage'

const original = useJourney.getState()
const requiredTask = {
  id: 'required-1', spotId: 'pingjiang', type: 'quiz' as const, title: '主线谜题',
  briefing: '主线说明', knowledgeScore: 10,
}
const optionalTask = {
  ...requiredTask, id: 'optional-1', type: 'multi_select' as const, title: '自选挑战', optional: true,
}

beforeEach(() => {
  useJourney.setState({
    ...original,
    state: 'EXPLORING',
    currentSpotId: 'pingjiang',
    spotStatus: { pingjiang: 'current' },
    spots: [{
      id: 'pingjiang', order: 1, name: '平江路', shortName: '平江路', lat: 31.3, lng: 120.6,
      triggerRadiusM: 30, intro: '点位介绍', story: '剧情说明', taskIds: ['required-1', 'optional-1'], codexIds: [],
    }],
    npcs: [],
    tasks: [requiredTask, optionalTask],
    taskStates: { 'required-1': { status: 'completed', attempts: 1, score: 10 } },
    codexEntries: [],
    unlockedCodex: [],
    routeInfo: { id: 'route', name: '路线', finale_location_id: 'subo', finale_choices: [] },
    report: {
      completedTaskCount: 1, totalTaskCount: 21, requiredTaskCount: 6, optionalTaskCount: 15,
      completedRequiredTaskCount: 1, completedOptionalTaskCount: 0,
      completedSpotCount: 0, totalSpotCount: 5, knowledgeScore: 10, maxScore: 210,
      unlockedCodexCount: 0, totalCodexCount: 14, durationMinutes: 1, events: [], weakPoints: [], bySpot: [],
    },
    ending: null,
    endingId: null,
    roleId: null,
  })
})
afterEach(() => { cleanup(); useJourney.setState(original, true) })

function mount(path: string, element: ReactNode, routePath = path) {
  const router = createMemoryRouter([{ path: routePath, element }], { initialEntries: [path] })
  render(<RouterProvider router={router} />)
}

it('点位页把主线与自选挑战分别列出和计数', () => {
  mount('/spot/pingjiang', <SpotPage />, '/spot/:spotId')
  expect(screen.getByRole('region', { name: '主线任务' })).toHaveTextContent('主线任务 · 1/1')
  expect(screen.getByRole('region', { name: '自选挑战' })).toHaveTextContent('自选挑战 · 0/1')
  expect(screen.getByRole('link', { name: /自选挑战/ })).toBeInTheDocument()
})

it('回访旧点位先调用服务端 arriveSpot，再开放点位内容', async () => {
  const arriveSpot = vi.fn(async (spotId: string) => {
    useJourney.setState({ currentSpotId: spotId })
    return true
  })
  useJourney.setState({
    currentSpotId: 'subo',
    spotStatus: { pingjiang: 'completed' },
    arriveSpot,
  })
  mount('/spot/pingjiang', <SpotPage />, '/spot/:spotId')
  fireEvent.click(screen.getByRole('button', { name: '回到此点继续探索' }))
  expect(await screen.findByRole('heading', { name: '这里的谜题' })).toBeInTheDocument()
  expect(arriveSpot).toHaveBeenCalledWith('pingjiang')
  expect(useJourney.getState().currentSpotId).toBe('pingjiang')
})

it('地图上的旧已完成点位通过 arriveSpot 后再进入详情', async () => {
  const arriveSpot = vi.fn(async () => true)
  useJourney.setState({
    currentSpotId: 'subo',
    spotStatus: { pingjiang: 'completed' },
    arriveSpot,
    themes: [{
      id: 'theme', name: '路线', subtitle: '路线说明', city: '苏州', district: '姑苏区',
      description: '路线描述', durationMinutes: 90, distanceKm: 3,
    }],
  })
  const router = createMemoryRouter([
    { path: '/map', element: <MapPage /> },
    { path: '/spot/:spotId', element: <p>已进入点位</p> },
  ], { initialEntries: ['/map'] })
  render(<RouterProvider router={router} />)
  fireEvent.click(screen.getByRole('button', { name: '回到此点继续探索' }))
  expect(await screen.findByText('已进入点位')).toBeInTheDocument()
  expect(arriveSpot).toHaveBeenCalledWith('pingjiang')
})

it('报告按服务端数据分别展示主线与挑战进度', () => {
  mount('/report', <ReportPage />)
  expect(screen.getByText('主线任务 1/6')).toBeInTheDocument()
  expect(screen.getByText('自选挑战 0/15')).toBeInTheDocument()
  expect(screen.getByText(/自选挑战可尝试/)).toBeInTheDocument()
})
