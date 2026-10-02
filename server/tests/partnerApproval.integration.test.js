import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import router from '../routes/api.js';
import { enforceHQAccess } from '../utils/hqAccess.js';
import { IndustryPartner } from '../models/IndustryPartner.js';
import { Institution } from '../models/Institution.js';
import { User } from '../models/User.js';
import { AuditLog } from '../models/AuditLog.js';
import { Notification } from '../models/Notification.js';
import { PARTNER_SECTORS } from '../utils/partnerTaxonomy.js';
import { Document } from '../models/Document.js';

test('partner approval decisions, correction recovery and regional review preserve boundaries', { skip: process.env.PARTNER_MONGO_INTEGRATION !== '1' }, async t => {
  await mongoose.connect(`mongodb://127.0.0.1:27030/partner_approval_qa_${Date.now()}`, { autoIndex: false, serverSelectionTimeoutMS: 3000 });
  try {
    const id = () => new mongoose.Types.ObjectId();
    const manager = { _id: id(), name: 'QA manager', role: 'Manager', institution: 'QA', region: 'Ashanti' };
    const regional = { _id: id(), name: 'Regional submitter', role: 'RegionalAdmin', region: 'Ashanti' };
    const hq = { _id: id(), name: 'HQ reviewer', role: 'HQManager', hqScopeType: 'National' };
    await Institution.collection.insertMany([{ name: 'QA', region: 'Ashanti' }, { name: 'Other', region: 'Ashanti' }]);
    await User.collection.insertMany([manager, regional, hq].map(actor => ({ ...actor, status: 'Active', notificationPreferences: { inApp: true, push: false } })));
    const call = async (path, method, actor, body = {}, params = {}, query = {}) => {
      const route = router.stack.find(l => l.route?.path === path && l.route.methods[method]).route;
      const req = { user: actor, method: method.toUpperCase(), path: path.replace(':id', String(params.id || '')).replace(':action', params.action || ''), body, params, query };
      const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
      let allowed = false; enforceHQAccess(req, res, () => { allowed = true; }); if (!allowed) return res;
      for (const layer of route.stack) { let next = false; await layer.handle(req, res, () => { next = true; }); if (!next) break; }
      return res;
    };
    const decision = (partner, action, version, actor = hq, comment) => call(`/industry-partners/:id/hq-${action}`, 'put', actor, { sourceApprovalVersion: version, approvalComment: comment }, { id: String(partner._id) });
    const create = async (name, actor = manager) => {
      const res = await call('/industry-partners', 'post', actor, { name, sector: PARTNER_SECTORS[0], region: 'Ashanti', totalSlots: 10 });
      assert.equal(res.code, 201, JSON.stringify(res.body)); return res.body;
    };
    await t.test('roles, scope, invalid input and missing reasons cannot decide', async () => {
      const partner = await create('Approval boundaries');
      for (const actor of [manager, regional, { ...hq, role: 'HQStaff' }]) assert.equal((await decision(partner, 'approve', 0, actor)).code, 403);
      assert.equal((await decision(partner, 'approve', 0, { ...hq, hqScopeType: 'Region', region: 'Volta' })).code, 404);
      for (const comment of [undefined, '', '  ', 'four', {}, 'a'.repeat(3001)]) assert.equal((await decision(partner, 'reject', 0, hq, comment)).code, 400);
      assert.equal((await call('/industry-partners/:id/hq-approve', 'put', hq, {}, { id: 'bad-id' })).code, 400);
      assert.equal((await decision(partner, 'approve', undefined)).code, 409);
      assert.equal((await IndustryPartner.findById(partner._id)).approvalStatus, 'PendingHQApproval');
    });
    await t.test('competing decisions commit once and cannot be reversed or repeated', async () => {
      const partner = await create('Concurrent decisions');
      const outcomes = await Promise.all([decision(partner, 'approve', 0), decision(partner, 'reject', 0, hq, 'Details need correction')]);
      assert.deepEqual(outcomes.map(r => r.code).sort(), [200, 409]);
      const stored = await IndustryPartner.findById(partner._id);
      assert.equal(stored.approvalVersion, 1);
      assert.equal((await decision(partner, 'approve', 1)).code, 409);
      assert.equal((await decision(partner, 'reject', 1, hq, 'Attempt to reverse')).code, 409);
      assert.equal(await AuditLog.countDocuments({ entityId: String(partner._id), 'metadata.approvalAction': { $exists: true } }), 1);
      assert.equal(await Notification.countDocuments({ recipient: manager._id, dedupeKey: `partner-decision:${partner._id}:1` }), 1);
    });
    await t.test('pending edits invalidate stale HQ reviews', async () => {
      const partner = await create('Stale review');
      assert.equal((await call('/industry-partners/:id', 'put', regional, { contactPhone: '0240000000' }, { id: String(partner._id) })).code, 200);
      assert.equal((await decision(partner, 'approve', 0)).code, 409);
      assert.equal((await decision(partner, 'approve', 1)).code, 200);
    });
    await t.test('submitting institution corrects rejection, receives fresh review and preserves decision history', async () => {
      const partner = await create('Rejected institution submission');
      assert.equal((await decision(partner, 'reject', 0, hq, '  Confirm contact person  ')).code, 200);
      const resubmit = (actor, version = 1) => call('/industry-partners/:id/resubmit', 'put', actor, { contactPerson: 'Corrected contact', sourceApprovalVersion: version }, { id: String(partner._id) });
      assert.equal((await resubmit({ ...manager, role: 'Staff' })).code, 403);
      // A linked institution can see the rejected registration but cannot own its correction.
      await IndustryPartner.updateOne({ _id: partner._id }, { $push: { linkedInstitutions: 'Other' } });
      assert.equal((await resubmit({ ...manager, institution: 'Other' })).code, 403);
      assert.equal((await resubmit(manager, 0)).code, 409);
      assert.equal((await resubmit(manager)).code, 200);
      const stored = await IndustryPartner.findById(partner._id);
      assert.equal(stored.approvalStatus, 'PendingHQApproval'); assert.equal(stored.approvalVersion, 2);
      assert.equal(stored.contactPerson, 'Corrected contact'); assert.equal(stored.approvalReviewedBy, undefined);
      assert.equal(stored.approvalReviewedAt, undefined); assert.equal(stored.approvalComment, '');
      assert.equal((await resubmit(manager)).code, 403);
      assert.equal((await decision(partner, 'approve', 0)).code, 409);
      assert.equal((await decision(partner, 'approve', 2)).code, 200);
      const rejection = await AuditLog.findOne({ entityId: String(partner._id), 'metadata.approvalAction': 'Rejected' });
      assert.equal(rejection.afterData.approvalComment, 'Confirm contact person');
      assert.equal(await Notification.countDocuments({ recipient: hq._id, dedupeKey: `partner-hq-submission:${partner._id}:2` }), 1);
    });
    await t.test('regional submitter can recover its own rejected registration', async () => {
      const partner = await create('Regional rejection', regional);
      assert.equal((await decision(partner, 'reject', 0, hq, 'Confirm workplace details')).code, 200);
      const body = { sourceApprovalVersion: 1, location: 'Corrected workplace' };
      assert.equal((await call('/industry-partners/:id/resubmit', 'put', { ...regional, _id: id() }, body, { id: String(partner._id) })).code, 403);
      assert.equal((await call('/industry-partners/:id/resubmit', 'put', regional, body, { id: String(partner._id) })).code, 200);
    });
    await t.test('regional corrections reach HQ without changing approved operational details', async () => {
      const partner = await create('Regional change review');
      assert.equal((await decision(partner, 'approve', 0)).code, 200);
      assert.equal((await call('/industry-partners/:id', 'put', regional, { name: 'Bypassed review' }, { id: String(partner._id) })).code, 409);
      const submit = actor => call('/industry-partners/:id/change-requests', 'post', actor, { proposed: { contactPhone: '0240000000' }, reason: 'Confirmed new contact phone' }, { id: String(partner._id) });
      assert.equal((await submit({ ...regional, region: 'Volta' })).code, 404);
      let response = await submit(regional); assert.equal(response.code, 201, JSON.stringify(response.body)); let change = response.body;
      assert.equal(change.status, 'HQReview'); assert.equal(change.submissionScope, 'Region');
      assert.equal((await submit(regional)).code, 409);
      assert.equal((await submit({ ...regional, region: 'Ashanti Region' })).code, 409);
      assert.equal((await IndustryPartner.findById(partner._id)).contactPhone, '');
      const act = (actor, action, version, comment) => call('/partner-change-requests/:id/:action', 'put', actor, { version, comment }, { id: String(change._id), action });
      assert.equal((await act(regional, 'approve', 0)).code, 403);
      assert.equal((await act({ ...hq, hqScopeType: 'Region', region: 'Volta' }, 'approve', 0)).code, 404);
      assert.equal((await act(hq, 'return', 0, 'Please reconfirm contact')).code, 200);
      response = await call('/partner-change-requests/:id/:action', 'put', regional, { version: 1, proposed: { contactPhone: '0241111111' }, reason: 'Reconfirmed contact details' }, { id: String(change._id), action: 'resubmit' });
      assert.equal(response.code, 200, JSON.stringify(response.body)); change = response.body;
      const queue = await call('/partner-change-requests', 'get', regional);
      assert.ok(queue.body.items.some(item => String(item.request._id) === String(change._id)));
      assert.equal((await act(hq, 'approve', 2)).code, 200);
      const stored = await IndustryPartner.findById(partner._id);
      assert.equal(stored.contactPhone, '0241111111'); assert.equal(stored.approvalStatus, 'Approved');
      const document = await Document.create({ institution: 'N/A', uploadedBy: regional._id, category: 'MoU', url: '/api/documents/local-file/document/regional/mou.pdf', publicId: 'local:regional/mou.pdf', fileName: 'mou.pdf', fileType: 'application/pdf' });
      const withMou = await call('/industry-partners/:id/change-requests', 'post', regional, { proposed: { mouDocumentUrl: document.url }, reason: 'Renewed employer agreement', attachmentIds: [String(document._id)] }, { id: String(partner._id) });
      assert.equal(withMou.code, 201, JSON.stringify(withMou.body));
    });
    await t.test('legacy registrations without approvalVersion can receive their first decision', async () => {
      const partnerId = id();
      await IndustryPartner.collection.insertOne({ _id: partnerId, name: 'Legacy pending', sector: PARTNER_SECTORS[0], region: 'Ashanti', approvalStatus: 'PendingHQApproval' });
      assert.equal((await decision({ _id: partnerId }, 'approve', 0)).code, 200);
      assert.equal((await IndustryPartner.findById(partnerId)).approvalVersion, 1);
    });
    await t.test('legacy approved registrations cannot bypass regional review and remain editable by SuperAdmin', async () => {
      const partnerId = id();
      await IndustryPartner.collection.insertOne({ _id: partnerId, name: 'Legacy approved', sector: PARTNER_SECTORS[0], region: 'Ashanti', status: 'Active' });
      assert.equal((await call('/industry-partners/:id', 'put', regional, { contactPhone: 'Bypassed' }, { id: String(partnerId) })).code, 409);
      assert.equal((await call('/industry-partners/:id', 'put', { ...hq, role: 'SuperAdmin' }, { contactPhone: 'Updated by HQ' }, { id: String(partnerId) })).code, 200);
      const stored = await IndustryPartner.collection.findOne({ _id: partnerId });
      assert.equal(stored.contactPhone, 'Updated by HQ'); assert.equal(stored.approvalStatus, undefined);
    });
  } finally { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); }
});
