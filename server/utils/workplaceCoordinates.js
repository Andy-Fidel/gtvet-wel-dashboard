export function hasCoordinates(value) {
  return typeof value?.lat === 'number' && Number.isFinite(value.lat) && value.lat >= -90 && value.lat <= 90
    && typeof value?.lng === 'number' && Number.isFinite(value.lng) && value.lng >= -180 && value.lng <= 180;
}

export const WORKSITE_MODES = ['FixedSite', 'HomeBased', 'MobileField', 'MultipleSites', 'TemporarySite', 'NoFixedPremises'];
export const FLEXIBLE_WORKSITE_MODES = ['MobileField', 'NoFixedPremises'];
export const LOCATION_VERIFICATION_STATUSES = ['PendingGPS', 'GPSVerified', 'TownSelected', 'Provisional', 'NotApplicableMobile', 'ExceptionApproved'];
export const ACTUAL_LOCATION_RADIUS_METRES = 500;
export const TOWN_LOCATION_RADIUS_METRES = 5000;
export const coordinateStatus = point => point?.precision === 'Town' ? 'TownSelected' : 'GPSVerified';

export function registeredCoordinates(partner) {
  if (hasCoordinates(partner?.coordinates)) return normalizeCoordinates(partner.coordinates);
  const town = partner?.approximateLocation;
  return hasCoordinates(town) ? normalizeCoordinates({ lat: town.lat, lng: town.lng, precision: 'Town', townName: town.name }) : undefined;
}

export function isFlexibleWorksite(mode) {
  return FLEXIBLE_WORKSITE_MODES.includes(mode);
}

export function worksiteRequiresCoordinates({ status = 'Active', worksiteMode = 'FixedSite', locationVerificationStatus = 'PendingGPS' } = {}) {
  if (status !== 'Active') return false;
  if (isFlexibleWorksite(worksiteMode)) return false;
  return !['Provisional', 'ExceptionApproved'].includes(locationVerificationStatus);
}

export function normalizeCoordinates(value, required = false) {
  const blank = v => v === undefined || v === null || (typeof v === 'string' && !v.trim());
  if (value != null && (typeof value !== 'object' || Array.isArray(value))) throw new Error('Provide workplace coordinates as latitude and longitude.');
  if (value == null || (blank(value.lat) && blank(value.lng))) {
    if (required) throw new Error('Workplace latitude and longitude are required before activating a placement.');
    return undefined;
  }
  if (blank(value.lat) || blank(value.lng) || !['number', 'string'].includes(typeof value.lat) || !['number', 'string'].includes(typeof value.lng)) {
    throw new Error('Provide both workplace latitude and longitude.');
  }
  const result = { lat: Number(value.lat), lng: Number(value.lng) };
  if (!hasCoordinates(result)) throw new Error('Latitude must be between -90 and 90; longitude between -180 and 180.');
  if (value.precision !== undefined && !['Actual', 'Town'].includes(value.precision)) throw new Error('Choose actual workplace or town location.');
  if (value.precision === 'Town') {
    if (typeof value.townName !== 'string' || !value.townName.trim() || value.townName.length > 500 || result.lat < 4 || result.lat > 12 || result.lng < -4 || result.lng > 2) throw new Error('Select a valid town location in Ghana.');
    result.precision = 'Town'; result.townName = value.townName.trim();
  } else if (value.precision === 'Actual') result.precision = 'Actual';
  return result;
}

export function locationCheck(location, site) {
  if (!hasCoordinates(location)) return { locationVerified: 'No GPS', gpsReviewStatus: 'PendingReview', distanceFromSite: null };
  if (!hasCoordinates(site)) return { locationVerified: 'Site coordinates missing', gpsReviewStatus: 'PendingReview', distanceFromSite: null };
  const radians = n => n * Math.PI / 180;
  const a = Math.sin(radians(site.lat - location.lat) / 2) ** 2
    + Math.cos(radians(location.lat)) * Math.cos(radians(site.lat)) * Math.sin(radians(site.lng - location.lng) / 2) ** 2;
  const distanceFromSite = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  const verified = distanceFromSite <= (site.precision === 'Town' ? TOWN_LOCATION_RADIUS_METRES : ACTUAL_LOCATION_RADIUS_METRES);
  return { locationVerified: verified ? 'Verified' : 'Unverified', gpsReviewStatus: verified ? 'Verified' : 'PendingReview', distanceFromSite };
}

export function monitoringLocationCheck(location, placement) {
  const site = placement?.coordinates;
  const flexible = isFlexibleWorksite(placement?.worksiteMode) && !hasCoordinates(site);
  const result = flexible && hasCoordinates(location)
    ? { locationVerified: 'Verified', gpsReviewStatus: 'Verified', distanceFromSite: null }
    : locationCheck(location, site);
  return { ...result,
    verificationLocationType: hasCoordinates(site) ? site.precision === 'Town' ? 'Town' : 'Actual' : flexible ? 'OperatingArea' : 'Missing',
    verificationRadiusMetres: hasCoordinates(site) ? site.precision === 'Town' ? TOWN_LOCATION_RADIUS_METRES : ACTUAL_LOCATION_RADIUS_METRES : null,
    verificationTownName: site?.precision === 'Town' ? site.townName : undefined,
    referenceCoordinates: hasCoordinates(site) ? normalizeCoordinates(site) : undefined,
  };
}
