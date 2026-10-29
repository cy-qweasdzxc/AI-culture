import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import CitywideAttractionExplorer from '@/components/CitywideAttractionExplorer'
import { api } from '@/services/api'

vi.mock('@/components/SpotMedia', () => ({ default: () => <div>已有许可照片</div> }))
afterEach(() => { cleanup(); vi.restoreAllMocks() })
const places = [
  { id: 'pingjiang', name: '平江历史文化街区', district: '姑苏区', category: '历史街区', lat: 31.3, lng: 120.6, tags: ['古城'], source_url: 'https://example.invalid/place', source_name: '合成测试来源', intro: '合成介绍', address: '合成地址' },
  { id: 'tongli', name: '同里古镇', district: '吴江区', category: '古镇', lat: 31.1, lng: 120.7, tags: [], source_url: '', intro: '合成介绍', address: '合成地址' },
]
const candidate = { id: 'synthetic-only', title: '合成候选资料', content: '未经审核的合成正文', content_type: 'fact', source_url: 'https://example.invalid/source', license: '合成许可', review_status: 'pending', trust_level: 'unverified', human_review_verified: false, is_demo: false }
function open() { const d = screen.getByText(/苏州全域景点资料/).closest('details')!; d.open = true; fireEvent(d, new Event('toggle')) }
it('loads on demand, filters and exposes pending provenance without granting playability', async () => {
  const get = vi.spyOn(api, 'get').mockImplementation(async (path) => path.endsWith('/attractions') ? { items: places } as never : { ...places.find((p) => path.endsWith(p.id)), source_candidates: path.endsWith('pingjiang') ? [candidate] : [] } as never)
  const post = vi.spyOn(api, 'post')
  render(<CitywideAttractionExplorer />); expect(get).not.toHaveBeenCalled(); open()
  expect(await screen.findByText('合成候选资料')).toBeVisible()
  expect(screen.getByText('未核验或待人工确认')).toBeVisible()
  expect(screen.queryByText('已记录人工审核')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: '查看原始来源' })).toHaveAttribute('href', candidate.source_url)
  fireEvent.change(screen.getByLabelText('行政区域'), { target: { value: '吴江区' } })
  expect(await screen.findByRole('heading', { name: '同里古镇' })).toBeVisible()
  expect(screen.queryByText('合成候选资料')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('搜索全域景点'), { target: { value: '没有这个景点' } })
  expect(screen.getByText('没有匹配的景点，请调整筛选。')).toBeVisible()
  expect(post).not.toHaveBeenCalled()
})
it('recovers a catalog failure with an explicit retry', async () => {
  const get = vi.spyOn(api, 'get').mockRejectedValueOnce(new Error('synthetic network failure')).mockImplementation(async (path) => path.endsWith('/attractions') ? { items: places } as never : { ...places[0], source_candidates: [] } as never)
  render(<CitywideAttractionExplorer />); open()
  fireEvent.click(await screen.findByRole('button', { name: '重试景点目录' }))
  await waitFor(() => expect(screen.getByText('共 2 个景点资料，当前筛选 2 个。这里提供资料预览，不新增可玩路线、任务或实地触发。')).toBeVisible())
  expect(get.mock.calls.filter(([p]) => p.endsWith('/attractions'))).toHaveLength(2)
})
