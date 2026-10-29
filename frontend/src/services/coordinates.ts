/** Approximate GCJ-02 inverse for display only; no surveyed entrance accuracy.
 * Formula adapted from wandergis/coordtransform (MIT); see licenses/coordtransform.txt.
 */
export type CoordinateSystem = 'gcj02' | 'wgs84'
export interface Coordinate { lat: number; lng: number; coordinateSystem?: CoordinateSystem }
export function validCoordinate(point: Coordinate): boolean {
  return Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180
}
export function toWgs84<T extends Coordinate>(point: T): (T & { coordinateSystem: 'wgs84' }) | null {
  if (!validCoordinate(point)) return null
  const { lat, lng } = point
  // The rectangle is an approximation of applicability, not a legal border.
  if (point.coordinateSystem === 'wgs84' || !(lng > 73.66 && lng < 135.05 && lat > 3.86 && lat < 53.55)) {
    return { ...point, coordinateSystem: 'wgs84' }
  }
  const pi = Math.PI, x = lng - 105, y = lat - 35
  let dLat = -100 + 2*x + 3*y + 0.2*y*y + 0.1*x*y + 0.2*Math.sqrt(Math.abs(x))
  dLat += (20*Math.sin(6*x*pi) + 20*Math.sin(2*x*pi))*2/3
  dLat += (20*Math.sin(y*pi) + 40*Math.sin(y/3*pi))*2/3
  dLat += (160*Math.sin(y/12*pi) + 320*Math.sin(y*pi/30))*2/3
  let dLng = 300 + x + 2*y + 0.1*x*x + 0.1*x*y + 0.1*Math.sqrt(Math.abs(x))
  dLng += (20*Math.sin(6*x*pi) + 20*Math.sin(2*x*pi))*2/3
  dLng += (20*Math.sin(x*pi) + 40*Math.sin(x/3*pi))*2/3
  dLng += (150*Math.sin(x/12*pi) + 300*Math.sin(x/30*pi))*2/3
  const rad = lat/180*pi, magic = 1 - 0.006693421622965943*Math.sin(rad)**2
  dLat = dLat*180 / ((6378245*(1-0.006693421622965943))/(magic*Math.sqrt(magic))*pi)
  dLng = dLng*180 / (6378245/Math.sqrt(magic)*Math.cos(rad)*pi)
  return { ...point, lat: lat-dLat, lng: lng-dLng, coordinateSystem: 'wgs84' }
}
