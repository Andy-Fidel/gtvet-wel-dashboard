import { placementError, placementLearnerIds, validatePlacementDates } from './placementWorkflow.js';
import { canonicalPartnerRegion } from './partnerDirectory.js';
import { coordinateStatus, isFlexibleWorksite, normalizeCoordinates, WORKSITE_MODES } from './workplaceCoordinates.js';

export function canEditPlacementRequest(user, request) {
  if (!user?.institution || user.institution !== request?.institution || request.archivedAt || request.convertedPlacementIds?.length) return false;
  const editable = request.sourceType === 'LearnerFound'
    ? ['SelfSourced_Submitted', 'Under_Verification', 'Approved', 'Rejected'].includes(request.status)
    : request.status === 'Submitted';
  if (!editable) return false;
  if (['Admin', 'Manager'].includes(user.role)) return true;
  const submittedBy = request.submittedBy?._id || request.submittedBy;
  return user.role === 'Staff' && String(submittedBy) === String(user._id)
    && ['Submitted', 'SelfSourced_Submitted', 'Rejected'].includes(request.status);
}

export function placementRequestEditValues(request, input) {
  if (!Number.isSafeInteger(input.sourceVersion) || input.sourceVersion < 0) throw placementError('Reload the request before saving changes.', 400);
  if ((request.workflowVersion || 0) !== input.sourceVersion) throw placementError('This request changed. Reload it before saving.');
  const values = {};
  for (const [key, max] of Object.entries({ placementRegion: 100, program: 300, expectedOperatingArea: 1000, locationVerificationNotes: 3000, worksiteLocation: 1000, supervisorName: 300, supervisorPhone: 100, supervisorEmail: 300 })) {
    const value = Object.hasOwn(input, key) ? input[key] : request[key] || '';
    if (typeof value !== 'string' || value.length > max) throw placementError(`Provide a valid ${key}.`, 400);
    values[key] = value.trim();
  }
  values.placementRegion = canonicalPartnerRegion(values.placementRegion);
  if (!values.placementRegion) throw placementError('Select a valid placement region.', 400);
  if (!values.program) throw placementError('Programme is required.', 400);
  if (values.supervisorEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.supervisorEmail)) throw placementError('Provide a valid supervisor email.', 400);
  values.learners = placementLearnerIds(input.learners ?? request.learners.map(String));
  values.requestedSlots = values.learners.length;
  values.startDate = input.startDate ?? request.startDate;
  values.endDate = input.endDate ?? request.endDate;
  for (const key of ['startDate', 'endDate']) if (Object.hasOwn(input, key) && typeof input[key] !== 'string') throw placementError('Provide valid placement dates.', 400);
  validatePlacementDates(values.startDate, values.endDate);
  values.worksiteMode = input.worksiteMode ?? request.worksiteMode ?? 'FixedSite';
  if (!WORKSITE_MODES.includes(values.worksiteMode)) throw placementError('Select a valid worksite mode.', 400);
  try { values.coordinates = normalizeCoordinates(Object.hasOwn(input, 'coordinates') ? input.coordinates : request.coordinates) || null; }
  catch (error) { throw placementError(error.message, 400); }
  values.locationVerificationStatus = values.coordinates ? coordinateStatus(values.coordinates) : isFlexibleWorksite(values.worksiteMode) ? 'NotApplicableMobile' : 'PendingGPS';
  values.partner = input.partner ?? request.partner ?? null;
  if (request.sourceType === 'LearnerFound') values.partner = null;
  if (!values.partner) {
    const host = input.selfSourcedHost ?? request.selfSourcedHost;
    if (!host || typeof host !== 'object' || Array.isArray(host)) throw placementError('Provide workplace details.', 400);
    values.selfSourcedHost = {};
    for (const key of ['companyName', 'sector', 'location', 'tradeArea', 'town', 'contactPerson', 'contactPhone', 'contactEmail', 'notes']) {
      const value = host[key] ?? '';
      if (typeof value !== 'string' || value.length > 3000) throw placementError(`Provide valid workplace ${key}.`, 400);
      values.selfSourcedHost[key] = value.trim();
    }
    if (['companyName', 'sector', 'location'].some(key => !values.selfSourcedHost[key])) throw placementError('Workplace name, sector and location are required.', 400);
    if (values.selfSourcedHost.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.selfSourcedHost.contactEmail)) throw placementError('Provide a valid workplace email.', 400);
  }
  // Material changes to a lead must be verified again, including previously approved leads.
  if (request.sourceType === 'LearnerFound') Object.assign(values, { status: 'SelfSourced_Submitted', verificationNotes: '', institutionComment: '', rejectionReason: '', reviewedByInstitution: null, verifiedAt: null });
  return values;
}
