/**
 * Browser geolocation guard for onsite mode.
 *
 * Coarse fixes (for example a desktop browser falling back to IP-based
 * location) can report accuracy in the hundreds of kilometres. Sending that
 * to `/location/trigger` cannot ever meet the trigger radius, so reject it
 * before the request and tell the user how to recover.
 */
export const MAX_ACCURACY_M = 100000

export interface LocationReadingLike {
  lat: number
  lng: number
  accuracy_m: number
}

export function isUsableReading(reading: LocationReadingLike): boolean {
  const { lat, lng, accuracy_m: accuracy } = reading
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Number.isFinite(accuracy) &&
    accuracy >= 0 &&
    accuracy <= MAX_ACCURACY_M
  )
}

export function formatAccuracy(meters: number): string {
  if (!Number.isFinite(meters)) return '±未知'
  const value = Math.abs(meters)
  if (value < 1000) return `±${Math.round(value)} 米`
  const km = value / 1000
  return `±${km >= 10 ? Math.round(km) : km.toFixed(1)} 公里`
}
