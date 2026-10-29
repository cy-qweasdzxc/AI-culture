import { toWgs84, type CoordinateSystem } from './coordinates'

export interface StreetMapPoint { id: string; name: string; lat: number; lng: number; coordinateSystem?: CoordinateSystem }

export function streetMapUrl(points: StreetMapPoint[], focusId?: string): string | null {
  const valid = points.map(toWgs84).filter((point): point is StreetMapPoint & { coordinateSystem: 'wgs84' } => point !== null).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)
    && Math.abs(point.lat) <= 85 && Math.abs(point.lng) <= 180)
  if (!valid.length) return null
  const focused = valid.find((point) => point.id === focusId)
  const extent = focused ? [focused] : valid
  const latitudes = extent.map((point) => point.lat), longitudes = extent.map((point) => point.lng)
  const minLat = Math.min(...latitudes), maxLat = Math.max(...latitudes)
  const minLng = Math.min(...longitudes), maxLng = Math.max(...longitudes)
  const latPadding = Math.max((maxLat - minLat) * 0.12, 0.006)
  const lngPadding = Math.max((maxLng - minLng) * 0.12, 0.008)
  const url = new URL('https://www.openstreetmap.org/export/embed.html')
  url.searchParams.set('bbox', [Math.max(-180, minLng - lngPadding), Math.max(-85, minLat - latPadding),
    Math.min(180, maxLng + lngPadding), Math.min(85, maxLat + latPadding)].join(','))
  url.searchParams.set('layer', 'mapnik')
  if (focused) url.searchParams.set('marker', `${focused.lat},${focused.lng}`)
  return url.toString()
}
