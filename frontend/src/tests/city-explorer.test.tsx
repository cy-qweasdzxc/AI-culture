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
