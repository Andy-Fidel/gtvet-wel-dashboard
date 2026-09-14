import { Institution } from '../models/Institution.js';

const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function partnerRegionMatch(region) {
  const name = String(region || '').trim().replace(/\s+region$/i, '').replace(/\s+/g, ' ');
  if (!name) return { $in: [] };
  const pattern = /^(greater accra|g\.?\s*accra)$/i.test(name)
    ? '(?:Greater\\s+Accra|G\\.?\\s*Accra)'
    : name.split(' ').map(escape).join('\\s+');
  return new RegExp(`^\\s*${pattern}(?:\\s+Region)?\\s*$`, 'i');
}

export async function partnerVisibilityFilter(user) {
  if (user.role === 'SuperAdmin') return {};
  if (['HQManager', 'HQStaff'].includes(user.role)) {
    if (!user.hqScopeType || user.hqScopeType === 'National') return {};
    if (user.hqScopeType === 'Region') return { region: partnerRegionMatch(user.region) };
    if (user.hqScopeType !== 'Institution') return { _id: { $in: [] } };
  } else if (user.role === 'RegionalAdmin') {
    return { region: partnerRegionMatch(user.region) };
  } else if (!['Admin', 'Manager', 'Staff'].includes(user.role)) {
    return { _id: { $in: [] } };
  }
  if (!user.institution) return { _id: { $in: [] } };
  const institution = await Institution.findOne({ name: user.institution }).select('region').lean();
  return { $or: [
    { linkedInstitutions: user.institution },
    { region: partnerRegionMatch(institution?.region || user.region),
      $or: [{ approvalStatus: 'Approved' }, { approvalStatus: { $exists: false } }] },
  ] };
}
