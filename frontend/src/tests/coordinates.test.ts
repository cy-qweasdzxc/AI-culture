import { expect, it } from 'vitest'
import { toWgs84 } from '@/services/coordinates'
import { streetMapUrl } from '@/services/streetMap'
it('converts a known Beijing GCJ reference within approximation tolerance and preserves input', () => {
  const raw = { lat: 39.91640428150164, lng: 116.41024449916938 }
  const result = toWgs84(raw)!
  expect(result.lat).toBeCloseTo(39.915, 4); expect(result.lng).toBeCloseTo(116.404, 4)
  expect(raw.lng).toBe(116.41024449916938)
  expect(toWgs84(result)).toEqual(result)
})
it('preserves explicit WGS-84 and coordinates outside the applicability rectangle', () => {
  expect(toWgs84({ lat: 31.3, lng: 120.6, coordinateSystem: 'wgs84' })!.lng).toBe(120.6)
  expect(toWgs84({ lat: 51.5, lng: -0.1 })!.lng).toBe(-0.1)
})
it('rejects malformed points and excludes mercator-incompatible poles', () => {
  for (const p of [{ lat: NaN, lng: 1 }, { lat: Infinity, lng: 1 }, { lat: 91, lng: 1 }, { lat: 1, lng: 181 }]) expect(toWgs84(p)).toBeNull()
  expect(streetMapUrl([{ id: 'pole', name: 'pole', lat: 89, lng: 0 }])).toBeNull()
})
