export type LocationMeta = { precision?: 'Actual' | 'Town'; townName?: string }
export type WorkplacePoint = { lat?: number; lng?: number } & LocationMeta
export const locationMeta = (point?: WorkplacePoint): LocationMeta => ({ precision: point?.precision || 'Actual', townName: point?.townName })
export const registeredPoint = (partner?: { coordinates?: WorkplacePoint; approximateLocation?: TownLocation | null }): WorkplacePoint | undefined => partner?.coordinates?.lat !== undefined && partner.coordinates.lng !== undefined ? partner.coordinates : partner?.approximateLocation ? { lat: partner.approximateLocation.lat, lng: partner.approximateLocation.lng, precision: 'Town', townName: partner.approximateLocation.name } : undefined

export type TownLocation = { name: string; lat: number; lng: number; source: 'OpenStreetMap'; precision: 'Town'; osmType: 'node' | 'way' | 'relation'; osmId: string }

export function readCoordinates(lat: string, lng: string, required = false, meta: LocationMeta = {}) {
  if (!lat.trim() && !lng.trim()) {
    if (meta.precision === 'Town') throw new Error('Search and select a town location.')
    if (required) throw new Error('Workplace latitude and longitude are required before activation.')
    return undefined
  }
  const coordinates = { lat: Number(lat), lng: Number(lng) }
  if (!lat.trim() || !lng.trim() || !Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lng)
      || Math.abs(coordinates.lat) > 90 || Math.abs(coordinates.lng) > 180) {
    throw new Error('Enter both coordinates: latitude -90 to 90 and longitude -180 to 180.')
  }
  if (meta.precision === 'Town' && !meta.townName?.trim()) throw new Error('Search and select a town location.')
  return { ...coordinates, ...(meta.precision ? { precision: meta.precision, ...(meta.precision === 'Town' ? { townName: meta.townName } : {}) } : {}) }
}
