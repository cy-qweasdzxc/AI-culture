import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CityExplorer from '@/components/CityExplorer'
import { api } from '@/services/api'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
test('building cities show sourced previews and cannot start a fabricated journey', async () => {
  vi.spyOn(api, 'get').mockImplementation(async (path: string) => {
    if (path === '/cities')
      return {
        items: [
          { id: 'suzhou', name: '苏州', status: 'open', theme: '园林' },
          { id: 'beijing', name: '北京', status: 'building', theme: '古都' },
        ],
      } as never
    if (path.endsWith('/places'))
      return {
        items: [
          {
            id: 'museum',
            name: '景点预览',
            status: 'building',
            source_url: 'https://example.org/source',
          },
        ],
      } as never
    return { items: [] } as never
  })
  const post = vi.spyOn(api, 'post').mockResolvedValue({ items: [] })
  render(
    <MemoryRouter>
      <CityExplorer />
    </MemoryRouter>,
  )
  fireEvent.click(await screen.findByRole('button', { name: /北京 · 筹备中/ }))
  await waitFor(() => expect(screen.getByText(/尚未开放完整剧情/)).toBeInTheDocument())
  expect(await screen.findByRole('link', { name: '原始资料来源' })).toHaveAttribute(
    'href',
    'https://example.org/source',
  )
  expect(screen.queryByRole('link', { name: '选择这条完整路线' })).not.toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole('button', { name: '推荐可用路线' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: '推荐可用路线' }))
  expect(await screen.findByText('该城市暂无可用游玩路线，可先浏览地点资料。')).toBeInTheDocument()
  expect(post.mock.calls[0][1]).toMatchObject({ city_id: 'beijing' })
})

test('主线突出完整路线，节选不作为独立旅程推荐，未知距离不显示占位', async () => {
  vi.spyOn(api, 'get').mockImplementation(async (path: string) => {
    if (path === '/cities')
      return { items: [{ id: 'suzhou', name: '苏州', status: 'open', theme: '园林' }] } as never
    if (path.endsWith('/places')) return { items: [] } as never
    return {
      items: [
        {
          id: 'classic',
          name: '平江寻梦',
          status: 'open',
          playable: true,
          stops: [{ id: 'pingjiang' }],
        },
        { id: 'preview', name: '水巷片段', status: 'demo', playable: false, stops: [] },
        { id: 'future', name: '昆曲与评弹', status: 'building', playable: false, stops: [] },
      ],
    } as never
  })
  vi.spyOn(api, 'post').mockResolvedValue({
    items: [
      {
        route_id: 'classic',
        name: '平江寻梦',
        preview_only: false,
        reasons: ['适合文化探索'],
        estimated_visit_minutes: null,
        walking_distance_m: null,
      },
      {
        route_id: 'preview',
        name: '水巷片段',
        preview_only: true,
        reasons: [],
        estimated_visit_minutes: null,
        walking_distance_m: null,
      },
    ],
  })
  render(
    <MemoryRouter>
      <CityExplorer />
    </MemoryRouter>,
  )
  expect(await screen.findByRole('link', { name: '选择这条完整路线' })).toHaveAttribute(
    'href',
    '/role',
  )
  expect(screen.queryByText('水巷片段')).not.toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole('button', { name: '推荐可用路线' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: '推荐可用路线' }))
  expect(await screen.findByText('适合文化探索')).toBeInTheDocument()
  expect(screen.queryByText('水巷片段')).not.toBeInTheDocument()
  expect(screen.queryByText(/未知|待核验|待道路规划/)).not.toBeInTheDocument()
  expect(screen.getAllByRole('link', { name: /选择.*(路线|角色)/ })).toHaveLength(2)
})
