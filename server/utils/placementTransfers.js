import mongoose from 'mongoose';
import { Placement } from '../models/Placement.js';
import { PlacementTransfer } from '../models/PlacementTransfer.js';
import { PlacementRequest } from '../models/PlacementRequest.js';
import { User } from '../models/User.js';
import { Learner } from '../models/Learner.js';
import { IndustryPartner } from '../models/IndustryPartner.js';
import { placementError, placementErrorStatus, placementInput, runPlacementOperation, placementOperationKey, validatePlacementDates } from './placementWorkflow.js';
import { normalizeCoordinates } from './workplaceCoordinates.js';
import { notifyUsers } from './notifications.js';
import { logAuditEvent } from './audit.js';

const operators = ['Admin', 'Manager', 'Staff'];
const managers = ['Admin', 'Manager'];
const emptyPlan = () => ({ placements: [], learnerIds: [], partnerIds: [] });
const day = value => new Date(value).toISOString().slice(0, 10);

export function validateTransferDates(source, effectiveDate, endDate, now = new Date()) {
  validatePlacementDates(effectiveDate, endDate);
  if (day(effectiveDate) < day(now)) throw placementError('Transfers cannot be backdated. Select today or a future date.', 400);
  if (!source.startDate || day(effectiveDate) <= day(source.startDate)) throw placementError('The transfer must start after the original placement start date.', 400);
  if (source.endDate && day(effectiveDate) > day(source.endDate)) throw placementError('The transfer must begin before the original placement ends.', 400);
}

export function registerPlacementTransfers(router, { prepareActivation, getScope, partnerVisibility }) {
  const scopedPlacement = async (req, id) => {
    const placement = await Placement.findOne({ $and: [{ _id: id, archivedAt: null }, await getScope(req.user)] });
    if (!placement) throw placementError('Placement not found.', 404);
    return placement;
  };
  const requireOperator = req => {
    if (!operators.includes(req.user.role) || !req.user.institution) throw placementError('Only institution staff can request workplace changes.', 403);
  };
  const notify = async (transfer, title, extra = []) => {
    const original = await Placement.findById(transfer.placement).select('owner delegate partner partnerSupervisor');
    const recipients = [original?.owner, original?.delegate, original?.partnerSupervisor];
    if (transfer.status === 'Applied') {
      const partners = [original?.partner, transfer.destination.partner].filter(Boolean);
      const supervisors = await User.find({ role: 'IndustryPartner', partnerId: { $in: partners }, status: 'Active' }).select('_id');
      recipients.push(...supervisors.map(u => u._id));
    }
    const guardians = await User.find({ role: 'Guardian', linkedLearners: transfer.learner, status: 'Active' }).select('_id');
    await notifyUsers({ institution: transfer.institution, roles: managers, recipientIds: [transfer.submittedBy, ...recipients, ...extra, ...guardians.map(g => g._id)].filter(Boolean).map(String), type: 'placement', title, message: `Workplace change to ${transfer.destination.companyName} — effective ${day(transfer.effectiveDate)}.`, link: '/placements', dedupeKey: `transfer:${transfer._id}:${transfer.status}:${title}` });
  };
  const resolveDestination = async (req, input, learner) => {
    const data = placementInput(input);
    if (input.sourceRequest) {
      const request = await PlacementRequest.findOne({ _id: input.sourceRequest, institution: req.user.institution, sourceType: 'LearnerFound', status: 'Approved', archivedAt: null, learners: learner });
      if (!request) throw placementError('Select an approved learner-sourced request for this learner.', 400);
      Object.assign(data, { partner: undefined, companyName: request.selfSourcedHost.companyName, sector: request.selfSourcedHost.sector, location: request.selfSourcedHost.location });
    } else {
      if (!mongoose.isValidObjectId(data.partner)) throw placementError('Select an approved partner or verified learner-sourced request.', 400);
      const partner = await IndustryPartner.findOne({ $and: [{ _id: data.partner, status: 'Active', approvalStatus: 'Approved' }, await partnerVisibility(req.user)] });
      if (!partner) throw placementError('Partner is not approved or is outside your access.', 400);
      Object.assign(data, { companyName: partner.name, sector: partner.sector, location: partner.location || partner.region });
    }
    data.coordinates = normalizeCoordinates(data.coordinates, true);
    if (!data.supervisorName?.trim() || !data.supervisorPhone?.trim() || !data.placementRegion?.trim()) throw placementError('Supervisor name, phone and placement region are required.', 400);
    return data;
  };

  router.get('/placement-transfers', async (req, res) => {
    try {
      const placements = await Placement.find(await getScope(req.user)).select('_id');
      const transfers = await PlacementTransfer.find({ placement: { $in: placements.map(p => p._id) }, status: { $in: ['Pending', 'Scheduled'] } }).populate('placement', 'companyName').populate('learner', 'firstName lastName trackingId').sort({ effectiveDate: 1 }).lean();
      res.set('Cache-Control', 'no-store').json(transfers);
    } catch (error) { res.status(placementErrorStatus(error)).json({ message: error.message }); }
  });

  router.get('/placements/:id/workplace-history', async (req, res) => {
    try {
      const source = await scopedPlacement(req, req.params.id);
      const scope = await getScope(req.user);
      const placements = await Placement.find({ $and: [{ learner: source.learner }, scope] }).select('companyName startDate endDate status closureReason previousPlacement replacementPlacement').sort({ startDate: 1 }).lean();
      const visibleIds = placements.map(p => p._id);
      const transfers = await PlacementTransfer.find({ placement: { $in: visibleIds } }).populate('submittedBy reviewedBy', 'name').sort({ createdAt: -1 }).lean();
      res.set('Cache-Control', 'no-store').json({ placements, transfers });
    } catch (error) { res.status(placementErrorStatus(error)).json({ message: error.message }); }
  });

  router.get('/placements/:id/transfer-options', async (req, res) => {
    try {
      requireOperator(req);
      const source = await scopedPlacement(req, req.params.id);
      if (source.institution !== req.user.institution) throw placementError('Only the owning institution may transfer this learner.', 403);
      const partners = await IndustryPartner.find({ $and: [{ status: 'Active', approvalStatus: 'Approved' }, await partnerVisibility(req.user)] }).select('name region location coordinates').sort({ name: 1 }).lean();
      const requests = await PlacementRequest.find({ institution: req.user.institution, learners: source.learner, sourceType: 'LearnerFound', status: 'Approved', archivedAt: null }).select('selfSourcedHost coordinates placementRegion').lean();
      res.json({ partners, requests });
    } catch (error) { res.status(placementErrorStatus(error)).json({ message: error.message }); }
  });

  router.post('/placements/:id/transfer-lead', async (req, res) => {
    try {
      requireOperator(req);
      const source = await scopedPlacement(req, req.params.id);
      if (source.institution !== req.user.institution || source.status !== 'Active') throw placementError('Select your institution’s active placement.');
      validateTransferDates(source, req.body.effectiveDate, req.body.endDate);
      for (const field of ['companyName', 'sector', 'location', 'supervisorName', 'supervisorPhone', 'placementRegion']) if (!String(req.body[field] || '').trim()) throw placementError(`${field} is required.`, 400);
      const learner = await Learner.findById(source.learner).select('program');
      const request = await PlacementRequest.create({ institution: source.institution, academicYear: source.academicYear, learners: [source.learner], program: learner?.program || 'Unassigned', requestedSlots: 1, submittedBy: req.user._id, sourceType: 'LearnerFound', status: 'SelfSourced_Submitted', placementRegion: req.body.placementRegion, coordinates: normalizeCoordinates(req.body.coordinates, true), startDate: req.body.effectiveDate, endDate: req.body.endDate,
        selfSourcedHost: { companyName: req.body.companyName, sector: req.body.sector, location: req.body.location, contactPerson: req.body.supervisorName, contactPhone: req.body.supervisorPhone, contactEmail: req.body.supervisorEmail, notes: `Proposed workplace transfer: ${String(req.body.reason || '').slice(0, 2000)}` } });
      await logAuditEvent({ req, action: 'CREATE', entityType: 'PlacementRequest', entityId: request._id, summary: 'Submitted transfer host for verification', after: request });
      await notifyUsers({ institution: source.institution, roles: managers, type: 'placement', title: 'Transfer host requires verification', message: 'Review the learner-sourced host in Placement Requests before requesting the workplace transfer.', link: '/placements' });
      res.status(201).json(request);
    } catch (error) { res.status(placementErrorStatus(error)).json({ message: error.message }); }
  });

  router.post('/placements/:id/transfers', async (req, res) => {
    try {
      requireOperator(req);
      const key = placementOperationKey(req.user, 'request-transfer', { id: req.params.id, ...req.body });
      const plan = await runPlacementOperation(key, async () => {
        const source = await scopedPlacement(req, req.params.id);
        if (source.institution !== req.user.institution || source.status !== 'Active') throw placementError('Only your institution’s active placements can be transferred.');
        if (await PlacementTransfer.exists({ placement: source._id, status: { $in: ['Pending', 'Scheduled'] } })) throw placementError('A workplace change is already pending.');
        if (Number(req.body.sourceVersion) !== (source.workflowVersion || 0)) throw placementError('Placement changed. Close and reopen the form.');
        const effectiveDate = new Date(req.body.effectiveDate);
        validateTransferDates(source, effectiveDate, req.body.endDate);
        const reason = String(req.body.reason || '').trim();
        if (reason.length < 5 || reason.length > 2000) throw placementError('Enter a reason between 5 and 2000 characters.', 400);
        const destination = await resolveDestination(req, req.body, source.learner);
        destination.startDate = new Date(`${day(effectiveDate)}T00:00:00Z`);
        destination.academicYear = source.academicYear;
        const transfer = new PlacementTransfer({ placement: source._id, learner: source.learner, institution: source.institution, submittedBy: req.user._id, reason, effectiveDate: destination.startDate, destination, sourceRequest: req.body.sourceRequest || undefined, sourceVersion: source.workflowVersion || 0 });
        await transfer.validate();
        return { ...emptyPlan(), transfer: { id: transfer._id, insert: true, values: transfer.toObject() } };
      });
      const transfer = await PlacementTransfer.findById(plan.transfer.id);
      await notify(transfer, 'Workplace change awaiting approval');
      await logAuditEvent({ req, action: 'CREATE', entityType: 'PlacementTransfer', entityId: transfer._id, summary: 'Requested workplace change', after: transfer });
      res.status(201).json(transfer);
    } catch (error) { res.status(placementErrorStatus(error)).json({ message: error.message }); }
  });

  async function buildActivation(req, transfer, source) {
    if (day(transfer.destination.endDate) < day(new Date())) throw placementError('The proposed placement has already ended. Cancel and submit a new request.');
    if (source.status !== 'Active' || source.archivedAt || (source.workflowVersion || 0) !== transfer.sourceVersion) throw placementError('Original placement changed. Cancel this request and submit a new one.');
    const destination = await resolveDestination(req, { ...transfer.destination, sourceRequest: transfer.sourceRequest }, source.learner);
    const { documents } = await prepareActivation(req, destination, [String(source.learner)], source._id);
    const replacement = documents[0];
    replacement.owner = source.owner || transfer.submittedBy;
    replacement.previousPlacement = source._id;
    await replacement.validate();
    const values = replacement.toObject();
    return {
      placements: [
        { id: source._id, insert: false, values: { status: 'Terminated', closureReason: 'Transferred', closureNote: transfer.reason, closedAt: transfer.effectiveDate, closedBy: req.user._id, endDate: new Date(new Date(transfer.effectiveDate).getTime() - 1), replacementPlacement: replacement._id } },
        { id: replacement._id, insert: true, values },
      ], learnerIds: [source.learner], partnerIds: [source.partner, replacement.partner].filter(Boolean),
      transfer: { id: transfer._id, values: { status: 'Applied', replacement: replacement._id, reviewedBy: req.user._id, reviewedAt: transfer.reviewedAt || new Date(), lastError: '' } },
      ...(transfer.sourceRequest ? { request: { id: transfer.sourceRequest, values: { status: 'Converted', convertedPlacementIds: [replacement._id] } } } : {}),
    };
  }

  router.post('/placement-transfers/:id/:action', async (req, res) => {
    try {
      requireOperator(req);
      const action = req.params.action;
      if (!['approve', 'reject', 'cancel'].includes(action)) throw placementError('Unknown action.', 400);
      if (action !== 'cancel' && !managers.includes(req.user.role)) throw placementError('Institution management approval is required.', 403);
      const plan = await runPlacementOperation(placementOperationKey(req.user, `transfer-${action}`, req.params.id), async () => {
        const transfer = await PlacementTransfer.findOne({ _id: req.params.id, institution: req.user.institution });
        if (!transfer) throw placementError('Request not found.', 404);
        if (!['Pending', 'Scheduled'].includes(transfer.status) || (action !== 'cancel' && transfer.status !== 'Pending')) throw placementError('This request has already been reviewed.');
        if (action === 'cancel' && !managers.includes(req.user.role) && String(transfer.submittedBy) !== String(req.user._id)) throw placementError('Only the requester or management may cancel.', 403);
        const note = String(req.body.note || '').trim();
        if (action === 'reject' && !note) throw placementError('A rejection reason is required.', 400);
        if (action !== 'approve') return { ...emptyPlan(), transfer: { id: transfer._id, values: { status: action === 'reject' ? 'Rejected' : 'Cancelled', reviewedBy: req.user._id, reviewedAt: new Date(), reviewNote: note } } };
        const source = await Placement.findById(transfer.placement);
        if (!source) throw placementError('Original placement is missing.');
        // Validate again under the placement lock before scheduling or applying.
        if (day(transfer.effectiveDate) < day(new Date())) throw placementError('Effective date has passed. Cancel and submit a new date.');
        const activation = await buildActivation(req, transfer, source);
        if (new Date(transfer.effectiveDate) > new Date()) return { ...emptyPlan(), transfer: { id: transfer._id, values: { status: 'Scheduled', reviewedBy: req.user._id, reviewedAt: new Date(), reviewNote: note } } };
        return activation;
      });
      const transfer = await PlacementTransfer.findById(plan.transfer.id);
      await notify(transfer, `Workplace change ${transfer.status.toLowerCase()}`);
      await logAuditEvent({ req, action: 'UPDATE', entityType: 'PlacementTransfer', entityId: transfer._id, summary: `Workplace change ${transfer.status}`, after: transfer });
      res.json(transfer);
    } catch (error) { res.status(placementErrorStatus(error)).json({ message: error.message }); }
  });

  return async function processDueTransfers() {
    const due = await PlacementTransfer.find({ status: 'Scheduled', effectiveDate: { $lte: new Date() } }).limit(50);
    for (const transfer of due) {
      try {
        const plan = await runPlacementOperation(`apply-transfer:${transfer._id}`, async () => {
          const fresh = await PlacementTransfer.findById(transfer._id);
          if (fresh.status !== 'Scheduled') return emptyPlan();
          const user = await User.findOne({ _id: fresh.reviewedBy, institution: fresh.institution, role: { $in: managers }, status: 'Active' });
          if (!user) throw placementError('Approver no longer has institution management access.');
          const source = await Placement.findById(fresh.placement);
          if (!source) throw placementError('Original placement is missing.');
          return buildActivation({ user }, fresh, source);
        });
        if (plan.transfer) {
          const applied = await PlacementTransfer.findById(transfer._id);
          await notify(applied, 'Workplace change applied');
          if (!plan.replayed) await logAuditEvent({ action: 'UPDATE', entityType: 'PlacementTransfer', entityId: applied._id, summary: 'Scheduled workplace change applied', after: applied, metadata: { actorName: 'Transfer scheduler', institution: applied.institution } });
        }
      } catch (error) {
        await PlacementTransfer.updateOne({ _id: transfer._id, status: 'Scheduled' }, { $set: { lastError: error.message } });
        await notify(transfer, 'Scheduled workplace change needs attention');
      }
    }
  };
}
