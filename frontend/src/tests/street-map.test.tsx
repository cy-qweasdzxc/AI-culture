import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import SchematicMap from '@/components/SchematicMap'
import StreetMapOverlay from '@/components/StreetMapOverlay'
import { streetMapUrl } from '@/services/streetMap'
import type { Spot } from '@/types'

const first = { id: 'one', name: '合成站一', shortName: '站一', order: 1, lat: 31.31, lng: 120.61 } as Spot
const second = { id: 'two', name: '合成站二', shortName: '站二', order: 2, lat: 31.34, lng: 120.65 } as Spot

afterEach(() => { cleanup(); vi.useRealTimers() })

it('does not connect to a street map until the user chooses it and excludes locked stations', () => {
  const clicked = vi.fn()
  render(<SchematicMap spots={[first, second]} spotStatus={{ one: 'current', two: 'undiscovered' }} onSpotClick={clicked} />)
  expect(screen.queryByTitle('OpenStreetMap 街道底图')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '合成站一：当前点位' }))
  expect(clicked).toHaveBeenCalledWith('one')
  expect(screen.getByRole('button', { name: '合成站二：未发现' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '加载 OpenStreetMap 街道底图' }))
  const frame = screen.getByTitle('OpenStreetMap 街道底图')
  expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer')
  const url = new URL(frame.getAttribute('src')!)
  expect(url.searchParams.get('marker')).toBe('31.31,120.61')
  expect(url.searchParams.get('bbox')).not.toContain('120.65')
  expect(screen.getByRole('link', { name: /OpenStreetMap contributors/ })).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright')
  fireEvent.click(screen.getByRole('button', { name: '返回示意图' }))
  expect(screen.queryByTitle('OpenStreetMap 街道底图')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '合成站二：未发现' })).toBeDisabled()
})

it('uses dynamic city bounds, validates coordinates and focuses the selected point', () => {
  const other = { id: 'other', name: '异地合成站', lat: 40.01, lng: 116.4 }
  const url = new URL(streetMapUrl([other])!)
  const [west, south, east, north] = url.searchParams.get('bbox')!.split(',').map(Number)
  expect(west).toBeLessThan(other.lng); expect(east).toBeGreaterThan(other.lng)
  expect(south).toBeLessThan(other.lat); expect(north).toBeGreaterThan(other.lat)
  expect(new URL(streetMapUrl([first, second], 'two')!).searchParams.get('marker')).toBe('31.34,120.65')
  expect(streetMapUrl([{ ...other, lat: Number.NaN }])).toBeNull()
})

it('can recover a failed external iframe without locking the journey into an error', () => {
  render(<StreetMapOverlay points={[first]} onClose={vi.fn()} />)
  fireEvent.error(screen.getByTitle('OpenStreetMap 街道底图'))
  expect(screen.getByRole('status')).toHaveTextContent('仍可返回示意路线')
  fireEvent.click(screen.getByRole('button', { name: '重试街道底图' }))
  expect(screen.getByTitle('OpenStreetMap 街道底图')).toBeInTheDocument()
})

it('times out a stalled iframe and clears timers after leaving the view', () => {
  vi.useFakeTimers()
  const view = render(<StreetMapOverlay points={[first]} onClose={vi.fn()} />)
  act(() => { vi.advanceTimersByTime(12000) })
  expect(screen.getByRole('status')).toHaveTextContent('街道底图暂不可用')
  fireEvent.click(screen.getByRole('button', { name: '重试街道底图' }))
  fireEvent.load(screen.getByTitle('OpenStreetMap 街道底图'))
  expect(vi.getTimerCount()).toBe(0)
  view.unmount()
  expect(vi.getTimerCount()).toBe(0)
})

it('does not offer an external map when every station is locked or has no disclosed status', () => {
  render(<SchematicMap spots={[first, second]} spotStatus={{ one: 'undiscovered' }} />)
  expect(screen.queryByRole('button', { name: '加载 OpenStreetMap 街道底图' })).not.toBeInTheDocument()
  expect(screen.queryByTitle('OpenStreetMap 街道底图')).not.toBeInTheDocument()
})
