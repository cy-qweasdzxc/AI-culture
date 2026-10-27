import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import JourneyBootstrap from '@/components/JourneyBootstrap'
import { useJourney } from '@/engine/journeyStore'
import { ApiError } from '@/services/api'
import MapPage from '@/pages/MapPage'

const original = useJourney.getState()
const spot = {
  id: 'pingjiang', order: 1, name: '平江路', shortName: '平江路', lat: 31.3, lng: 120.6,
  triggerRadiusM: 30, intro: '点位介绍', story: '剧情说明', taskIds: [], codexIds: [],
}

function prepare(arriveSpot: () => Promise<boolean>) {
  useJourney.setState({
    ...original,
    ready: true,
    busy: false,
    error: null,
    state: 'EXPLORING',
    mode: 'onsite',
    currentSpotId: null,
    spotStatus: { pingjiang: 'discovered' },
    spots: [spot],
    npcs: [],
    tasks: [],
    arriveSpot,
    restore: vi.fn(async () => undefined),
  })
}

function mount() {
  const router = createMemoryRouter([
    { path: '/map', element: <JourneyBootstrap><MapPage /></JourneyBootstrap> },
  ], { initialEntries: ['/map'] })
  render(<RouterProvider router={router} />)
}

function stubPosition(accuracy: number) {
  const getCurrentPosition = vi.fn((onSuccess: PositionCallback) =>
    onSuccess({ coords: { latitude: 31.3, longitude: 120.6, accuracy } } as GeolocationPosition))
  vi.stubGlobal('isSecureContext', true)
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
  return getCurrentPosition
}

afterEach(() => {
  cleanup()
  useJourney.setState(original, true)
  vi.unstubAllGlobals()
})

it('rejects a coarse onsite reading locally with actionable feedback and no API call', async () => {
  const arriveSpot = vi.fn(async () => true)
  stubPosition(806391.7)
  prepare(arriveSpot)
  useJourney.setState({ error: '请求字段无效。' })
  mount()
  fireEvent.click(screen.getByRole('button', { name: '使用我的位置到达' }))
  expect(await screen.findByText('当前定位精度不足（约 ±806 公里），请到开阔处重试，或切换虚拟游览模式。')).toBeInTheDocument()
  expect(arriveSpot).not.toHaveBeenCalled()
  expect(useJourney.getState().error).toBeNull()
  expect(screen.queryByText('请求字段无效。')).not.toBeInTheDocument()
})

it('translates a 422 validation error and clears the raw global banner', async () => {
  const arriveSpot = vi.fn(async () => {
    useJourney.setState({ error: '请求字段无效。' })
    throw new ApiError('VALIDATION_ERROR', '请求字段无效。', 422)
  })
  stubPosition(12)
  prepare(arriveSpot)
  mount()
  fireEvent.click(screen.getByRole('button', { name: '使用我的位置到达' }))
  expect(await screen.findByText('定位数据超出允许范围，请重试或切换虚拟游览模式。')).toBeInTheDocument()
  await waitFor(() => expect(useJourney.getState().error).toBeNull())
  expect(screen.queryByText('请求字段无效。')).not.toBeInTheDocument()
  expect(arriveSpot).toHaveBeenCalledWith('pingjiang', {
    lat: 31.3,
    lng: 120.6,
    accuracy_m: 12,
    coordinate_system: 'wgs84',
  })
})
