import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import { registerPartnerChanges, normalizePartnerChanges, canReadPartnerChangeDocument } from '../utils/partnerChanges.js';
import { IndustryPartner } from '../models/IndustryPartner.js';
import { Institution } from '../models/Institution.js';
import { Document } from '../models/Document.js';
import { canHQRequest } from '../utils/hqAccess.js';

test('partner changes whitelist shared fields and validate values', () => {
  for (const input of [{ usedSlots: 9 }, { status: 'Inactive' }, { linkedInstitutions: [] }, { totalSlots: -1 }, { totalSlots: 1.5 }, { coordinates: { lat: 91, lng: 0 } }, { name: '' }, { website: 'javascript:alert(1)' }, { contactEmail: 'invalid' }, { programs: ['$bad', {}] }]) assert.throws(() => normalizePartnerChanges(input));
  assert.deepEqual(normalizePartnerChanges({ name: ' Updated ', totalSlots: 0 }), { name: 'Updated', totalSlots: 0 });
  assert.equal(canHQRequest('HQManager', 'PUT', '/partner-change-requests/id/approve'), true);
  assert.equal(canHQRequest('HQManager', 'PUT', '/partner-change-requests/id/resubmit'), false);
  assert.equal(canHQRequest('HQStaff', 'PUT', '/partner-change-requests/id/approve'), false);
});

test('partner review lifecycle, scope, conflicts and atomic decisions', { skip: process.env.PARTNER_MONGO_INTEGRATION !== '1' }, async t => {
  await mongoose.connect(`mongodb://127.0.0.1:27030/partner_changes_qa_${Date.now()}`, { autoIndex: false, serverSelectionTimeoutMS: 3000 });
  try {
    const router = express.Router(); registerPartnerChanges(router);
    const id = () => new mongoose.Types.ObjectId();
    const staff = { _id: id(), name: 'QA Staff', role: 'Staff', institution: 'QA', region: 'Greater Accra' };
    const manager = { ...staff, _id: id(), name: 'QA Manager', role: 'Manager' };
    const hq = { _id: id(), name: 'HQ Reviewer', role: 'HQManager', hqScopeType: 'National' };
    await Institution.collection.insertMany([{ name: 'QA', region: 'Greater Accra' }, { name: 'Other', region: 'Greater Accra' }]);
    const partner = await IndustryPartner.create({ name: 'Shared employer', sector: 'IT', region: 'Greater Accra', linkedInstitutions: ['QA'], approvalStatus: 'Approved', totalSlots: 10, usedSlots: 3, contactPhone: '0200000000' });
    const call = async (path, method, actor, body = {}, params = {}) => {
      const handler = router.stack.find(l => l.route?.path === path && l.route.methods[method]).route.stack.at(-1).handle;
      const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
      await handler({ user: actor, body, params, query: {} }, res); return res;
    };
    const submit = (actor, proposed, extra = {}) => call('/industry-partners/:id/change-requests', 'post', actor, { proposed, reason: 'Verified with the employer', ...extra }, { id: String(partner._id) });
    const decide = (actor, change, action, extra = {}) => call('/partner-change-requests/:id/:action', 'put', actor, { version: change.version, ...extra }, { id: String(change._id), action });
    const list = actor => call('/partner-change-requests', 'get', actor);
    await t.test('submission validates scope, evidence and duplicate pending requests', async () => {
      assert.equal((await submit(hq, { name: 'Bad' })).code, 403);
      assert.equal((await submit({ ...staff, institution: 'Elsewhere', region: 'Ashanti' }, { name: 'Bad' })).code, 404);
      assert.equal((await submit(staff, { contactPhone: 'new' }, { attachmentIds: [String(id())] })).code, 400);
      assert.equal((await submit(staff, { mouDocumentUrl: 'https://example.test/file.pdf' })).code, 400);
    });
    let response = await submit(staff, { contactPhone: '0240000000', coordinates: { lat: 5.6, lng: -0.2 } });
    assert.equal(response.code, 201, JSON.stringify(response.body));
    let change = response.body;
    assert.equal(change.status, 'InstitutionReview');
    assert.equal((await IndustryPartner.findById(partner._id)).contactPhone, '0200000000');
    assert.equal((await submit(manager, { name: 'Duplicate' })).code, 409);
    assert.equal((await decide(staff, change, 'approve')).code, 403);
    assert.equal((await decide(hq, change, 'approve')).code, 403);
    assert.equal((await list({ ...staff, _id: id() })).body.total, 0);
    assert.equal((await list({ ...manager, institution: 'Other' })).body.total, 0);
    assert.equal((await list(manager)).body.total, 1);
    assert.equal((await list({ ...hq, hqScopeType: 'Institution', institution: 'Other' })).body.total, 0);
    assert.equal((await decide({ ...manager, institution: 'Other' }, change, 'approve')).code, 404);
    response = await decide(manager, change, 'approve');
    assert.equal(response.code, 200, JSON.stringify(response.body)); change = response.body;
    assert.equal(change.status, 'HQReview');
    assert.equal((await decide({ ...hq, role: 'HQStaff' }, change, 'approve')).code, 403);
    assert.equal((await decide({ ...hq, hqScopeType: 'Region', region: 'Ashanti' }, change, 'approve')).code, 404);
    await IndustryPartner.updateOne({ _id: partner._id }, { $set: { contactPhone: 'Changed concurrently' } });
    assert.equal((await decide(hq, change, 'approve')).code, 409);
    assert.equal((await decide(hq, change, 'return', { comment: 'Please verify updated contact' })).code, 200);
    change = (await list(staff)).body.items[0].request;
    assert.equal(change.status, 'Returned');
    response = await decide(staff, change, 'resubmit', { proposed: { contactPhone: '0240000000' }, reason: 'Reconfirmed with employer' });
    assert.equal(response.code, 200, JSON.stringify(response.body)); change = response.body;
    change = (await decide(manager, change, 'approve')).body;
    const decisions = await Promise.all([decide(hq, change, 'approve'), decide(hq, change, 'reject', { comment: 'Concurrent review decision' })]);
    assert.deepEqual(decisions.map(r => r.code).sort(), [200, 409]);
    const saved = await IndustryPartner.findById(partner._id).select('+changeRequests').lean();
    assert.equal(saved.changeRequests[0].status, decisions[0].code === 200 ? 'Approved' : 'Rejected');
    assert.equal(saved.contactPhone, decisions[0].code === 200 ? '0240000000' : 'Changed concurrently');
    assert.equal(saved.changeRequests[0].history.length, 6);
    assert.equal((await IndustryPartner.findById(partner._id).lean()).changeRequests, undefined);
    await t.test('management submissions, capacity guard, withdrawal and private relationship details', async () => {
      let current = (await submit(manager, { totalSlots: 2 })).body;
      assert.equal(current.status, 'HQReview');
      assert.equal((await decide(hq, current, 'approve')).code, 409);
      assert.equal((await decide(manager, current, 'withdraw')).code, 200);
      current = (await submit(manager, { totalSlots: 8 })).body;
      const approved = await decide(hq, current, 'approve');
      assert.equal(approved.code, 200, JSON.stringify(approved.body));
      assert.equal((await IndustryPartner.findById(partner._id)).totalSlots, 8);
      const path = '/industry-partners/:id/institution-details', params = { id: String(partner._id) };
      const details = { version: 0, contactPerson: 'Local contact', contactPhone: '', contactEmail: '', liaisonOfficer: 'Officer A', notes: 'Institution-only notes' };
      assert.equal((await call(path, 'put', staff, details, params)).code, 403);
      assert.equal((await call(path, 'put', manager, details, params)).code, 200);
      assert.equal((await call(path, 'put', manager, details, params)).code, 409);
      assert.equal((await call(path, 'get', staff, {}, params)).body.notes, details.notes);
      assert.equal((await call(path, 'get', { ...manager, institution: 'Other' }, {}, params)).body.notes, undefined);
      assert.equal((await IndustryPartner.findById(partner._id).lean()).institutionDetails, undefined);
    });
    await t.test('supporting document access follows partner review scope', async () => {
      const doc = await Document.create({ institution: 'QA', uploadedBy: manager._id, category: 'MoU', url: '/api/documents/local-file/document/test/mou.pdf', publicId: 'local:test/mou.pdf', fileName: 'mou.pdf', fileType: 'application/pdf' });
      const request = await submit(manager, { mouDocumentUrl: doc.url }, { attachmentIds: [String(doc._id)] });
      assert.equal(request.code, 201, JSON.stringify(request.body));
      assert.equal(await canReadPartnerChangeDocument({ ...hq, hqScopeType: 'Region', region: 'Greater Accra' }, doc), true);
      assert.equal(await canReadPartnerChangeDocument({ ...hq, hqScopeType: 'Region', region: 'Ashanti' }, doc), false);
      assert.equal(await canReadPartnerChangeDocument({ ...staff, institution: 'Other' }, doc), false);
      assert.equal((await decide(hq, request.body, 'approve')).code, 200);
      assert.equal(await canReadPartnerChangeDocument({ ...staff, institution: 'Other' }, doc), true);
    });
  } finally { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); }
});
