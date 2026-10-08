export type TownLocation = { name: string; lat: number; lng: number; source: 'OpenStreetMap'; precision: 'Town'; osmType: 'node' | 'way' | 'relation'; osmId: string }

export function readCoordinates(lat: string, lng: string, required = false) {
  if (!lat.trim() && !lng.trim()) {
    if (required) throw new Error('Workplace latitude and longitude are required before activation.')
    return undefined
  }
  const coordinates = { lat: Number(lat), lng: Number(lng) }
  if (!lat.trim() || !lng.trim() || !Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lng)
      || Math.abs(coordinates.lat) > 90 || Math.abs(coordinates.lng) > 180) {
    throw new Error('Enter both coordinates: latitude -90 to 90 and longitude -180 to 180.')
  }
  return coordinates
}
