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

it('shows a placeholder when both the real photo and the illustration fail', async () => {
  get.mockResolvedValue({ items: [asset()] })
  render(<SpotMedia locationId="pingjiang" name="平江路" />)
  fireEvent.error(await screen.findByAltText('合成媒体夹具'))
  fireEvent.error(screen.getByAltText('平江路艺术化示意'))
  expect(screen.queryByRole('img', { name: '平江路艺术化示意' })).not.toBeInTheDocument()
  expect(screen.getByText('图片暂不可用')).toBeInTheDocument()
  expect(screen.getByText(/加载失败/)).toBeInTheDocument()
})

it('retains the failed photo credits while showing the illustration', async () => {
  get.mockResolvedValue({ items: [asset()] })
  render(<SpotMedia locationId="pingjiang" name="平江路" />)
  fireEvent.error(await screen.findByAltText('合成媒体夹具'))
  expect(screen.getByRole('link', { name: '原始文件页面' })).toHaveAttribute('href', 'https://example.invalid/source')
  expect(screen.getByText(/合成作者/)).toBeInTheDocument()
})

it('prioritizes a real photograph over a licensed illustration', async () => {
  get.mockResolvedValue({ items: [asset('illustration', '/assets/art.jpg'), asset()] })
  render(<SpotMedia locationId="pingjiang" name="平江路" />)
  expect(await screen.findByAltText('合成媒体夹具')).toHaveAttribute('src', '/assets/first.jpg')
})
it('ignores a previous place response arriving after a fast place switch', async () => {
  let previous: (value: unknown) => void = () => undefined
  get.mockReturnValueOnce(new Promise(resolve => { previous = resolve })).mockResolvedValueOnce({ items: [asset('photograph', '/assets/current.jpg')] })
  const view = render(<SpotMedia locationId="pingjiang" name="平江路" />)
  view.rerender(<SpotMedia locationId="ouyuan" name="耦园" />)
  await waitFor(() => expect(screen.getByAltText('合成媒体夹具')).toHaveAttribute('src', '/assets/current.jpg'))
  previous({ items: [asset()] })
  await waitFor(() => expect(screen.getByAltText('合成媒体夹具')).toHaveAttribute('src', '/assets/current.jpg'))
})
it('recovers manually after media API failure without automatically looping', async () => {
  get.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce({ items: [asset()] })
  render(<SpotMedia locationId="pingjiang" name="平江路" />)
  await screen.findByText(/图片资料暂时无法加载/)
  expect(get).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: '重新加载图片' }))
  await screen.findByAltText('合成媒体夹具')
  expect(get).toHaveBeenCalledTimes(2)
})
