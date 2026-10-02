export const approvalVersionFilter = version => version === 0
  ? { $or: [{ approvalVersion: 0 }, { approvalVersion: { $exists: false } }] }
  : { approvalVersion: version };

export function canResubmitPartner(user, partner) {
  if (partner.approvalStatus !== 'Rejected') return false;
  if (user.role === 'SuperAdmin') return true;
  if (user.role === 'RegionalAdmin') return String(partner.addedBy?._id || partner.addedBy) === String(user._id);
  if (!['Admin', 'Manager'].includes(user.role) || !user.institution) return false;
  return (partner.submittedByInstitution || partner.addedBy?.institution) === user.institution;
}

export function approvalComment(value, rejected) {
  if (value !== undefined && typeof value !== 'string') throw new Error('Review comment must be text.');
  const comment = (value || '').trim();
  if (comment.length > 3000) throw new Error('Review comment must be at most 3000 characters.');
  if (rejected && comment.length < 5) throw new Error('Provide a rejection reason of at least 5 characters.');
  return comment;
}
