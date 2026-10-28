import { User } from '../models/User.js';

const types = ['RegisteredCompany', 'MasterCraftPerson', 'Government', 'NGO', 'Other'];
const empty = field => ({ $or: [{ [field]: { $exists: false } }, { [field]: null }, { [field]: '' }] });
const attention = {
  missingPrograms: { $expr: { $eq: [{ $size: { $ifNull: ['$programs', []] } }, 0] } },
  missingDistrict: empty('district'), missingEmail: empty('contactEmail'), missingMou: empty('mouDocumentUrl'),
};
const sorts = {
  newest: { createdAt: -1, _id: 1 }, oldest: { createdAt: 1, _id: 1 },
  'name-asc': { name: 1, _id: 1 }, 'name-desc': { name: -1, _id: 1 },
};
const invalid = message => Object.assign(new Error(message), { status: 400 });

export function hqRegistryOptions(params) {
  const clauses = [];
  if (params.partnerStatus) {
    if (!['Active', 'Inactive'].includes(params.partnerStatus)) throw invalid('Select a valid partner status.');
    clauses.push({ status: params.partnerStatus });
  }
  if (params.partnerType) {
    if (!types.includes(params.partnerType)) throw invalid('Select a valid partner type.');
    clauses.push(params.partnerType === 'RegisteredCompany'
      ? { $or: [{ partnerType: 'RegisteredCompany' }, { partnerType: { $exists: false } }, { partnerType: null }, { partnerType: '' }] }
      : { partnerType: params.partnerType });
  }
  if (params.attention) {
    if (typeof params.attention !== 'string' || !Object.hasOwn(attention, params.attention)) throw invalid('Select a valid attention filter.');
    clauses.push(attention[params.attention]);
  }
  const sort = params.sort || 'newest';
  if (typeof sort !== 'string' || !Object.hasOwn(sorts, sort)) throw invalid('Select a valid partner sort order.');
  return { clauses, sort: sorts[sort] };
}

// One projected read for a scoped page; never return credentials or unrelated account identities.
export async function partnerPortalSummaries(partners, { emailConflicts = false } = {}) {
  if (!partners.length) return [];
  const ids = partners.map(partner => partner._id);
  const emails = partners.map(partner => partner.contactEmail).filter(Boolean);
  const accounts = await User.find({ $or: [{ partnerId: { $in: ids } }, ...(emailConflicts ? [{ email: { $in: emails } }] : [])] })
    .select('partnerId partnerPortalRole role email status passwordChangeRequired invitationDeliveryStatus')
    .lean();
  const byPartner = new Map();
  const byEmail = new Map();
  for (const account of accounts) {
    byEmail.set(account.email, account);
    if (account.role !== 'IndustryPartner' || !account.partnerId) continue;
    const id = String(account.partnerId);
    const list = byPartner.get(id) || [];
    list.push(account);
    byPartner.set(id, list);
  }
  return partners.map(partner => {
    const linked = byPartner.get(String(partner._id)) || [];
    const coordinator = linked.find(account => account.partnerPortalRole !== 'Supervisor');
    const state = coordinator
      ? coordinator.status !== 'Active' ? 'Suspended'
        : coordinator.invitationDeliveryStatus === 'failed' ? 'DeliveryFailed'
          : coordinator.passwordChangeRequired ? 'SetupPending' : 'Active'
      : emailConflicts && byEmail.has(partner.contactEmail) ? 'EmailInUse' : 'NotCreated';
    return { ...partner, portalAccount: { state, count: linked.length } };
  });
}
