import { Institution } from '../models/Institution.js';
import { partnerRegionMatch } from './partnerVisibility.js';

export const GHANA_REGIONS = ['Ahafo', 'Ashanti', 'Bono', 'Bono East', 'Central', 'Eastern', 'Greater Accra', 'North East', 'Northern', 'Oti', 'Savannah', 'Upper East', 'Upper West', 'Volta', 'Western', 'Western North'];
export const isInstitutionPartnerUser = user => ['Admin', 'Manager', 'Staff'].includes(user?.role) && Boolean(user.institution);
export const canonicalPartnerRegion = value => GHANA_REGIONS.find(region => partnerRegionMatch(region).test(String(value || ''))) || '';

export async function partnerDirectoryFilters(user, query) {
  const directory = query.directory === '1' && isInstitutionPartnerUser(user);
  const submissions = directory && query.view === 'submissions';
  const institution = directory ? await Institution.findOne({ name: user.institution }).select('region').lean() : null;
  const institutionRegion = canonicalPartnerRegion(institution?.region || user.region);
  const requestedRegion = typeof query.region === 'string' ? query.region.trim() : '';
  const selectedRegion = submissions ? 'all' : requestedRegion || (directory ? institutionRegion || 'all' : 'all');
  if (selectedRegion !== 'all' && !canonicalPartnerRegion(selectedRegion)) throw Object.assign(new Error('Select a valid Ghana region.'), { status: 400 });
  const clauses = [];
  if (selectedRegion !== 'all') clauses.push({ region: partnerRegionMatch(selectedRegion) });
  if (submissions) clauses.push({ $or: [{ submittedByInstitution: user.institution }, { addedBy: user._id }] });
  const sector = typeof query.sector === 'string' ? query.sector.trim() : '';
  if (sector.length > 200) throw Object.assign(new Error('Select a valid sector.'), { status: 400 });
  if (sector) clauses.push({ sector });
  return { directory, submissions, clauses, institutionRegion, selectedRegion: selectedRegion === 'all' ? 'all' : canonicalPartnerRegion(selectedRegion) };
}
