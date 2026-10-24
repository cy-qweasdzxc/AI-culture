import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import SpotMedia from '@/components/SpotMedia'
import { api } from '@/services/api'

vi.mock('@/services/api', () => ({ api: { get: vi.fn() } }))
const get = vi.mocked(api.get)
const asset = (kind = 'photograph', url = '/assets/first.jpg') => ({
  id: url, kind, url, title: '合成媒体夹具', caption: '不是真实文化资料', displayable: true,
  author: '合成作者', source_url: 'https://example.invalid/source', license: '合成许可',
  license_url: 'https://example.invalid/license', attribution: '合成署名',
})
beforeEach(() => get.mockReset())
afterEach(cleanup)

it('shows the existing labeled illustration when a published photograph fails to load', async () => {
  get.mockResolvedValue({ items: [asset()] })
  render(<SpotMedia locationId="pingjiang" name="平江路" />)
  const image = await screen.findByAltText('合成媒体夹具')
  fireEvent.error(image)
  expect(screen.queryByText('合成媒体夹具 · 实景照片')).not.toBeInTheDocument()
  expect(screen.getByAltText('平江路艺术化示意')).toBeInTheDocument()
})

it('does not label licensed illustrations as real photographs', async () => {
  get.mockResolvedValue({ items: [asset('illustration')] })
  render(<SpotMedia locationId="pingjiang" name="平江路" />)
  await screen.findByAltText('合成媒体夹具')
  expect(screen.queryByText('合成媒体夹具 · 实景照片')).not.toBeInTheDocument()
  expect(screen.getByText('合成媒体夹具 · 艺术化示意')).toBeInTheDocument()
})

it('can show another place photo after a previous image failed', async () => {
  get.mockResolvedValueOnce({ items: [asset()] }).mockResolvedValueOnce({ items: [asset('photograph', '/assets/second.jpg')] })
  const view = render(<SpotMedia locationId="pingjiang" name="平江路" />)
  fireEvent.error(await screen.findByAltText('合成媒体夹具'))
  view.rerender(<SpotMedia locationId="ouyuan" name="耦园" />)
  await waitFor(() => expect(screen.getByAltText('合成媒体夹具')).toHaveAttribute('src', '/assets/second.jpg'))
})
