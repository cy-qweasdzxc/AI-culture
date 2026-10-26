import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CityExplorer from '@/components/CityExplorer'
import { api } from '@/services/api'

afterEach(() => {cleanup(); vi.restoreAllMocks()})
test('building cities show sourced previews and cannot start a fabricated journey', async () => {
  vi.spyOn(api,'get').mockImplementation(async (path:string) => {
    if (path === '/cities') return {items:[{id:'suzhou',name:'苏州',status:'open',theme:'园林'}, {id:'beijing',name:'北京',status:'building',theme:'古都'}]} as never
    if (path.endsWith('/places')) return {items:[{id:'museum',name:'景点预览',status:'building',source_url:'https://example.org/source'}]} as never
    return {items:[]} as never
  })
  const post = vi.spyOn(api,'post').mockResolvedValue({items:[]})
  render(<MemoryRouter><CityExplorer /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button',{name:/北京 · 建设中/}))
  await waitFor(() => expect(screen.getByText(/尚未开放完整剧情/)).toBeInTheDocument())
  expect(await screen.findByRole('link',{name:'原始资料来源'})).toHaveAttribute('href','https://example.org/source')
  expect(screen.queryByRole('link',{name:'选择这条完整路线'})).not.toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole('button',{name:'推荐可用路线'})).toBeEnabled())
  fireEvent.click(screen.getByRole('button',{name:'推荐可用路线'}))
  expect(await screen.findByText('该城市暂无可用游玩路线，可先浏览地点资料。')).toBeInTheDocument()
  expect(post.mock.calls[0][1]).toMatchObject({city_id:'beijing'})
})

test('playable city route carries its city, story, and route into role selection', async () => {
  vi.spyOn(api,'get').mockImplementation(async (path:string) => {
    if (path === '/cities') return {items:[{id:'suzhou',name:'苏州',status:'open',theme:'园林'}, {id:'hangzhou',name:'杭州',status:'open',theme:'湖山'}]} as never
    if (path.endsWith('/routes')) return {items:[{id:'hangzhou-xihu-classic',city_id:'hangzhou',story_id:'hangzhou-xihu',name:'西湖听景 · 三站虚拟路线',status:'open',playable:true,onsite_ready:false,note:'虚拟游览',stops:[{id:'westlake'}]}]} as never
    return {items:[]} as never
  })
  render(<MemoryRouter><CityExplorer /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button',{name:/杭州 · 在线可玩/}))
  const link = await screen.findByRole('link',{name:/使用「西湖听景/})
  expect(link).toHaveAttribute('href','/role?city=hangzhou&story=hangzhou-xihu&route=hangzhou-xihu-classic')
  expect(screen.getByText(/仅虚拟游览/)).toBeInTheDocument()
})
