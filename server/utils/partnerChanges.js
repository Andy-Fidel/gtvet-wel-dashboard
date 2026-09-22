import mongoose from 'mongoose';
import { IndustryPartner } from '../models/IndustryPartner.js';
import { Document } from '../models/Document.js';
import { User } from '../models/User.js';
import { partnerVisibilityFilter, partnerRegionMatch } from './partnerVisibility.js';
import { notifyUsers } from './notifications.js';
import { logAuditEvent } from './audit.js';
import { runPlacementOperation } from './placementWorkflow.js';
import { hasCoordinates, isFlexibleWorksite } from './workplaceCoordinates.js';

export const partnerChangeFields = ['name', 'sector', 'region', 'district', 'tradeArea', 'town', 'location', 'coordinates', 'partnerType', 'operatingModel', 'locationVerificationNotes', 'ghanaPostGps', 'contactPerson', 'contactPhone', 'contactEmail', 'website', 'totalSlots', 'programs', 'mouDocumentUrl'];
const institutionRoles = ['Admin', 'Manager', 'Staff'];
const pending = ['InstitutionReview', 'HQReview', 'Returned'];
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const event = (req, action, comment, extra = {}) => ({ action, actor: req.user._id, actorName: req.user.name, comment, at: new Date(), ...extra });

export function normalizePartnerChanges(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Provide the proposed fields.');
  const result = {};
  for (const [key, value] of Object.entries(input)) {
    if (!partnerChangeFields.includes(key)) fail(`The field ${key} cannot be changed through this workflow.`);
    if (key === 'totalSlots') {
      if (!Number.isSafeInteger(value) || value < 0) fail('Capacity must be a non-negative whole number.');
      result[key] = value;
    } else if (key === 'programs') {
      if (!Array.isArray(value) || value.length > 100 || value.some(v => typeof v !== 'string' || !v.trim() || v.length > 200)) fail('Provide valid programme names.');
      result[key] = [...new Set(value.map(v => v.trim()))];
    } else if (key === 'coordinates') {
      if (!value || typeof value.lat !== 'number' || typeof value.lng !== 'number' || !Number.isFinite(value.lat) || !Number.isFinite(value.lng) || Math.abs(value.lat) > 90 || Math.abs(value.lng) > 180) fail('Provide valid latitude and longitude.');
      result[key] = { lat: value.lat, lng: value.lng };
    } else if (key === 'partnerType') {
      if (!['RegisteredCompany', 'MasterCraftPerson', 'Government', 'NGO', 'Other'].includes(value)) fail('Select a valid partner type.');
      result[key] = value;
    } else if (key === 'operatingModel') {
      if (!['FixedSite', 'HomeBased', 'MobileField', 'MultipleSites', 'TemporarySite', 'NoFixedPremises'].includes(value)) fail('Select a valid operating model.');
      result[key] = value;
    } else {
      if (typeof value !== 'string' || value.length > 2000) fail(`Provide a valid ${key}.`);
      result[key] = value.trim();
      if (['name', 'sector', 'region'].includes(key) && !result[key]) fail(`${key} is required.`);
      if (key === 'contactEmail' && result[key] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result[key])) fail('Provide a valid email address.');
      if (key === 'website' && result[key] && !/^https?:\/\/[^\s]+$/i.test(result[key])) fail('Website must start with https:// or http://.');
    }
  }
  return result;
}

async function scope(user) {
  if (user.role === 'SuperAdmin') return {};
  if (['HQManager', 'HQStaff'].includes(user.role)) {
    if (!user.hqScopeType || user.hqScopeType === 'National') return {};
    if (user.hqScopeType === 'Region' && user.region) return { region: partnerRegionMatch(user.region) };
    if (user.hqScopeType === 'Institution' && user.institution) return { linkedInstitutions: user.institution };
    fail('No review scope assigned.', 403);
  }
  if (!institutionRoles.includes(user.role) || !user.institution) fail('Access denied.', 403);
  return partnerVisibilityFilter(user);
}
async function reviewScope(user) {
  const visible = await scope(user);
  return institutionRoles.includes(user.role) ? { $or: [visible, { 'changeRequests.institution': user.institution }] } : visible;
}
export async function canReadPartnerChangeDocument(user, document) {
  if (!['SuperAdmin', 'HQManager', 'HQStaff', 'Admin', 'Manager', 'Staff', 'RegionalAdmin'].includes(user.role)) return false;
  // Approved MoUs are part of the shared partner record.
  const visibility = await partnerVisibilityFilter(user);
  if (document.url && await IndustryPartner.exists({ $and: [visibility, { mouDocumentUrl: document.url }] })) return true;
  if (!['HQManager', 'HQStaff'].includes(user.role)) return false;
  try {
    return !!await IndustryPartner.exists({ $and: [await scope(user), { $or: [{ 'changeRequests.attachments.documentId': document._id }, { 'changeRequests.history.attachments.documentId': document._id }] }] });
  } catch { return false; }
}
function requestVisible(user, request) {
  return !institutionRoles.includes(user.role) || (request.institution === user.institution && (user.role !== 'Staff' || String(request.requester) === String(user._id)));
}
function text(value, label) {
  if (typeof value !== 'string' || value.trim().length < 5 || value.length > 3000) fail(`${label} must contain 5–3000 characters.`);
  return value.trim();
}
async function proposal(req, partner) {
  const values = normalizePartnerChanges(req.body.proposed);
  const proposed = {}, original = {};
  for (const [field, value] of Object.entries(values)) {
    if (!same(value, partner[field])) { proposed[field] = value; original[field] = partner[field] ?? null; }
  }
  if (Object.hasOwn(proposed, 'coordinates') || Object.hasOwn(proposed, 'operatingModel')) {
    const coordinates = proposed.coordinates ?? partner.coordinates;
    const operatingModel = proposed.operatingModel ?? partner.operatingModel ?? 'FixedSite';
    proposed.locationVerificationStatus = hasCoordinates(coordinates) ? 'GPSVerified' : isFlexibleWorksite(operatingModel) ? 'NotApplicableMobile' : 'PendingGPS';
    original.locationVerificationStatus = partner.locationVerificationStatus ?? 'PendingGPS';
  }
  if (!Object.keys(proposed).length) fail('Change at least one partner detail.');
  const ids = req.body.attachmentIds || [];
  if (!Array.isArray(ids) || ids.length > 5 || ids.some(id => !mongoose.isValidObjectId(id))) fail('Attach up to five supporting documents.');
  const docs = await Document.find({ _id: { $in: ids }, institution: req.user.institution, uploadedBy: req.user._id, category: { $in: ['Other', 'MoU'] }, learner: null, placement: null, monitoringVisit: null, supportTicket: null, employerEvaluation: null }).lean();
  if (docs.length !== new Set(ids).size) fail('One or more supporting documents are unavailable.');
  if (proposed.mouDocumentUrl && !docs.some(doc => doc.url === proposed.mouDocumentUrl && doc.category === 'MoU')) fail('Attach the new MoU document.');
  return { proposed, original, reason: text(req.body.reason, 'Reason'), attachments: docs.map(doc => ({ documentId: doc._id, fileName: doc.fileName, url: doc.url })) };
}
async function announce(req, partner, change, action) {
  await logAuditEvent({ req, action: 'UPDATE', entityType: 'IndustryPartner', entityId: partner._id, summary: `Partner change request: ${action}`, before: change.original, after: change.proposed, metadata: { requestId: change._id, institution: change.institution, status: change.status } });
  let recipients = [String(change.requester)];
  if (change.status === 'InstitutionReview') {
    const users = await User.find({ role: { $in: ['Admin', 'Manager'] }, institution: change.institution }).select('_id');
    recipients.push(...users.map(u => String(u._id)));
  }
  if (change.status === 'HQReview') {
    const users = await User.find({ $or: [{ role: 'SuperAdmin' }, { role: 'HQManager', $or: [{ hqScopeType: { $in: ['National', null] } }, { hqScopeType: 'Region', region: partnerRegionMatch(partner.region) }, { hqScopeType: 'Institution', institution: { $in: partner.linkedInstitutions || [] } }] }] }).select('_id');
    recipients.push(...users.map(u => String(u._id)));
  }
  await notifyUsers({ recipientIds: recipients, sender: req.user._id, type: 'partner', title: `Partner change: ${change.status}`, message: `${partner.name}: ${action}.`, dedupeKey: `partner-change:${change._id}:${change.version}`, link: null });
}

export function registerPartnerChanges(router) {
  const handler = fn => async (req, res) => {
    try { await fn(req, res); }
    catch (error) { res.status(error.status || (error.code === 11000 ? 409 : error.name === 'ValidationError' || error.name === 'CastError' ? 400 : 500)).json({ message: error.code === 11000 ? 'A partner with that name already exists.' : error.status || error.name === 'ValidationError' ? error.message : 'Unable to process the partner change.' }); }
  };
  router.get('/partner-change-requests', handler(async (req, res) => {
    const filter = await reviewScope(req.user);
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const match = {};
    if (institutionRoles.includes(req.user.role)) {
      match['changeRequests.institution'] = req.user.institution;
      if (req.user.role === 'Staff') match['changeRequests.requester'] = new mongoose.Types.ObjectId(String(req.user._id));
    }
    const pipeline = [{ $match: filter }, { $unwind: '$changeRequests' }, { $match: match }, { $sort: { 'changeRequests.updatedAt': -1, 'changeRequests._id': -1 } }];
    const [result] = await IndustryPartner.aggregate([...pipeline, { $facet: { items: [{ $skip: (page - 1) * 20 }, { $limit: 20 }, { $project: { _id: 0, partnerId: '$_id', partnerName: '$name', request: '$changeRequests', current: Object.fromEntries(partnerChangeFields.map(f => [f, `$${f}`])) } }], count: [{ $count: 'total' }] } }]);
    res.json({ items: result.items, total: result.count[0]?.total || 0 });
  }));
  router.post('/industry-partners/:id/change-requests', handler(async (req, res) => {
    if (!institutionRoles.includes(req.user.role)) fail('Only institution users may submit changes.', 403);
    const partnerScope = await scope(req.user);
    const filter = { $and: [{ _id: req.params.id }, partnerScope] };
    const partner = await IndustryPartner.findOne(filter).lean();
    if (!partner) fail('Partner not found.', 404);
    if (partner.approvalStatus && partner.approvalStatus !== 'Approved') fail('Only approved partners can receive change requests.');
    const data = await proposal(req, partner);
    const change = { _id: new mongoose.Types.ObjectId(), ...data, institution: req.user.institution, requester: req.user._id, requesterName: req.user.name, status: req.user.role === 'Staff' ? 'InstitutionReview' : 'HQReview', version: 0, createdAt: new Date(), updatedAt: new Date(), history: [event(req, 'Submitted', data.reason, data)] };
    const updated = await IndustryPartner.updateOne({ $and: [filter, { changeRequests: { $not: { $elemMatch: { institution: req.user.institution, status: { $in: pending } } } } }] }, { $push: { changeRequests: change } });
    if (!updated.modifiedCount) fail('Your institution already has an open change request for this partner.', 409);
    await announce(req, partner, change, 'Submitted');
    res.status(201).json(change);
  }));
  router.put('/partner-change-requests/:id/:action', handler(async (req, res) => {
    const partnerScope = await reviewScope(req.user);
    const partner = await IndustryPartner.findOne({ $and: [partnerScope, { 'changeRequests._id': req.params.id }] }).select('+changeRequests').lean();
    const change = partner?.changeRequests.find(c => String(c._id) === req.params.id);
    if (!change || !requestVisible(req.user, change)) fail('Request not found.', 404);
    if (!Number.isInteger(req.body.version) || req.body.version !== change.version) fail('This request changed. Reload before continuing.', 409);
    const action = req.params.action;
    const own = String(change.requester) === String(req.user._id);
    const institutionReview = ['Admin', 'Manager'].includes(req.user.role) && req.user.institution === change.institution && change.status === 'InstitutionReview' && !own;
    const hqReview = ['SuperAdmin', 'HQManager'].includes(req.user.role) && change.status === 'HQReview' && !own;
    let status, data = {}, comment = '';
    if (action === 'withdraw' && own && pending.includes(change.status)) status = 'Withdrawn';
    else if (action === 'resubmit' && own && institutionRoles.includes(req.user.role) && change.status === 'Returned') {
      data = await proposal(req, partner);
      status = req.user.role === 'Staff' ? 'InstitutionReview' : 'HQReview';
      comment = data.reason;
    } else if (['approve', 'reject', 'return'].includes(action) && (institutionReview || hqReview)) {
      if (action !== 'approve') comment = text(req.body.comment, 'Review comment');
      else if (req.body.comment) {
        if (typeof req.body.comment !== 'string' || req.body.comment.length > 3000) fail('Review comment must be at most 3000 characters.');
        comment = req.body.comment.trim();
      }
      status = action === 'return' ? 'Returned' : action === 'reject' ? 'Rejected' : institutionReview ? 'HQReview' : 'Approved';
    } else fail('This action is not available for your role or the request status.', 403);
    const clauses = [partnerScope, { _id: partner._id, changeRequests: { $elemMatch: { _id: change._id, version: change.version, status: change.status } } }];
    const set = { 'changeRequests.$.status': status, 'changeRequests.$.updatedAt': new Date() };
    for (const [key, value] of Object.entries(data)) set[`changeRequests.$.${key}`] = value;
    if (status === 'Approved') {
      if (partner.approvalStatus && partner.approvalStatus !== 'Approved') fail('Partner is no longer approved.', 409);
      const conflicts = Object.keys(change.proposed).filter(field => !same(partner[field], change.original[field]));
      if (conflicts.length) fail(`Partner details changed: ${conflicts.join(', ')}. Return the request for correction.`, 409);
      for (const [field, original] of Object.entries(change.original)) clauses.push({ [field]: original });
      clauses.push({ approvalStatus: partner.approvalStatus ?? null });
      if (Object.hasOwn(change.proposed, 'totalSlots')) {
        if (change.proposed.totalSlots < partner.usedSlots) fail('Capacity cannot be lower than occupied slots.', 409);
        clauses.push({ usedSlots: { $lte: change.proposed.totalSlots } });
      }
      Object.assign(set, change.proposed);
    }
    const apply = async () => {
      const updated = await IndustryPartner.updateOne({ $and: clauses }, { $set: set, $inc: { 'changeRequests.$.version': 1 }, $push: { 'changeRequests.$.history': event(req, status, comment, action === 'resubmit' ? data : {}) } }, { runValidators: true });
      if (!updated.modifiedCount) fail('The partner or request changed. Reload before continuing.', 409);
    };
    // Serialize capacity decisions with placement allocation and recovery.
    if (status === 'Approved' && Object.hasOwn(change.proposed, 'totalSlots')) {
      await runPlacementOperation(`partner-capacity:${change._id}:${change.version}`, async () => {
        await apply();
        return { placements: [], learnerIds: [], partnerIds: [] };
      });
    } else await apply();
    const result = { ...change, ...data, status, version: change.version + 1 };
    await announce(req, partner, result, status);
    res.json(result);
  }));
  router.get('/industry-partners/:id/institution-details', handler(async (req, res) => {
    if (!institutionRoles.includes(req.user.role)) fail('Access denied.', 403);
    const partner = await IndustryPartner.findOne({ $and: [{ _id: req.params.id }, await scope(req.user)] }).select('+institutionDetails').lean();
    if (!partner) fail('Partner not found.', 404);
    res.json(partner.institutionDetails?.find(d => d.institution === req.user.institution) || { version: 0 });
  }));
  router.put('/industry-partners/:id/institution-details', handler(async (req, res) => {
    if (!['Admin', 'Manager'].includes(req.user.role)) fail('Only institution management can edit relationship details.', 403);
    const filter = { $and: [{ _id: req.params.id }, await scope(req.user)] };
    const partner = await IndustryPartner.findOne(filter).select('+institutionDetails').lean();
    if (!partner) fail('Partner not found.', 404);
    const before = partner.institutionDetails?.find(d => d.institution === req.user.institution);
    if (req.body.version !== (before?.version || 0)) fail('Relationship details changed. Reload first.', 409);
    const data = { institution: req.user.institution, version: (before?.version || 0) + 1 };
    for (const field of ['contactPerson', 'contactPhone', 'contactEmail', 'liaisonOfficer', 'notes']) {
      if (typeof req.body[field] !== 'string' || req.body[field].length > 3000) fail(`Provide a valid ${field}.`);
      data[field] = req.body[field].trim();
    }
    if (data.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contactEmail)) fail('Provide a valid email address.');
    const result = before
      ? await IndustryPartner.updateOne({ $and: [filter, { institutionDetails: { $elemMatch: { institution: req.user.institution, version: before.version } } }] }, { $set: { 'institutionDetails.$': data } })
      : await IndustryPartner.updateOne({ $and: [filter, { 'institutionDetails.institution': { $ne: req.user.institution } }] }, { $push: { institutionDetails: data } });
    if (!result.modifiedCount) fail('Relationship details changed. Reload first.', 409);
    await logAuditEvent({ req, action: 'UPDATE', entityType: 'IndustryPartner', entityId: partner._id, summary: 'Updated institution relationship details', before, after: data });
    res.json(data);
  }));
}
