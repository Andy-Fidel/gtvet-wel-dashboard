export function normalizeApproximateLocation(value) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value) || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 500
      || typeof value.lat !== 'number' || typeof value.lng !== 'number' || !Number.isFinite(value.lat) || !Number.isFinite(value.lng)
      || value.lat < 4 || value.lat > 12 || value.lng < -4 || value.lng > 2
      || value.source !== 'OpenStreetMap' || value.precision !== 'Town'
      || !['node', 'way', 'relation'].includes(value.osmType) || !/^\d{1,20}$/.test(value.osmId)) {
    throw Object.assign(new Error('Select a valid approximate town location in Ghana.'), { status: 400 });
  }
  return { name: value.name.trim(), lat: value.lat, lng: value.lng, source: 'OpenStreetMap', precision: 'Town', osmType: value.osmType, osmId: value.osmId };
}
