import { Institution } from '../models/Institution.js';
import { isHQRole, isScopedHQRole } from './hqAccess.js';

const id = value => value?._id?.toString?.() || value?.toString?.() || '';

export async function canAccessSupportTicket(user, ticket) {
  if (!ticket) return false;
  if (user.role === 'SuperAdmin') return true;
  if (isScopedHQRole(user.role) && (user.hqScopeType || 'National') === 'National') return true;
  if (user.role === 'Guardian') return id(ticket.requester) === id(user._id);
  if (user.role === 'IndustryPartner') return Boolean(id(user.partnerId)) && id(ticket.partnerId) === id(user.partnerId);
  if (isScopedHQRole(user.role) && user.hqScopeType === 'Institution') return ticket.institution === user.institution;
  if (user.role === 'RegionalAdmin' || (isScopedHQRole(user.role) && user.hqScopeType === 'Region')) {
    if (!user.region) return false;
    const institution = await Institution.findOne({ name: ticket.institution, region: user.region }).select('_id').lean();
    return Boolean(institution);
  }
  if (isHQRole(user.role)) return false;
  return Boolean(user.institution) && ticket.institution === user.institution;
}

export function isSupportResponder(user, ticket) {
  return ['SuperAdmin', 'RegionalAdmin', 'Admin', 'Manager', 'Staff'].includes(user.role)
    && (user.role === 'SuperAdmin' || user.role === 'RegionalAdmin' || user.institution === ticket.institution);
}
