import test from 'node:test';
import assert from 'node:assert/strict';
import { canEditPlacementRequest, placementRequestEditValues } from '../utils/placementRequestEdits.js';
const id = '507f1f77bcf86cd799439011';
const request = { institution: 'QA', sourceType: 'InstitutionFound', status: 'Submitted', submittedBy: id, workflowVersion: 2, learners: [id], program: 'IT', partner: id, placementRegion: 'G. Accra', startDate: '2026-10-12', endDate: '2026-11-12' };

test('pending edit permission enforces institution, ownership and lifecycle', () => {
  assert.equal(canEditPlacementRequest({ role: 'Staff', institution: 'QA', _id: id }, request), true);
  assert.equal(canEditPlacementRequest({ role: 'Staff', institution: 'QA', _id: 'other' }, request), false);
  for (const role of ['Admin', 'Manager']) assert.equal(canEditPlacementRequest({ role, institution: 'QA' }, request), true);
  for (const role of ['HQManager', 'Guardian', 'RegionalAdmin']) assert.equal(canEditPlacementRequest({ role, institution: 'QA' }, request), false);
  for (const changed of [{ institution: 'Other' }, { archivedAt: new Date() }, { status: 'Converted' }, { convertedPlacementIds: [id] }]) assert.equal(canEditPlacementRequest({ role: 'Admin', institution: 'QA' }, { ...request, ...changed }), false);
});
test('edit allowlist ignores forged ownership and status, derives slots and checks stale versions', () => {
  const values = placementRequestEditValues(request, { sourceVersion: 2, institution: 'Other', status: 'Converted', submittedBy: 'other', requestedSlots: 999 });
  assert.equal(values.institution, undefined); assert.equal(values.status, undefined); assert.equal(values.submittedBy, undefined); assert.equal(values.requestedSlots, 1); assert.equal(values.placementRegion, 'Greater Accra');
  assert.throws(() => placementRequestEditValues(request, { sourceVersion: 1 }), /changed/);
  assert.throws(() => placementRequestEditValues(request, {}), /Reload/);
  assert.throws(() => placementRequestEditValues(request, { sourceVersion: 2, learners: [id, id] }), /once/);
  assert.throws(() => placementRequestEditValues(request, { sourceVersion: 2, endDate: '2000-01-01' }), /before/);
});
test('editing approved leads resets verification rather than retaining approval', () => {
  const lead = { ...request, sourceType: 'LearnerFound', status: 'Approved', selfSourcedHost: { companyName: 'QA', sector: 'IT', location: 'Accra' } };
  const values = placementRequestEditValues(lead, { sourceVersion: 2, coordinates: null });
  assert.equal(values.partner, null); assert.equal(values.coordinates, null); assert.equal(values.status, 'SelfSourced_Submitted'); assert.equal(values.verifiedAt, null); assert.equal(values.reviewedByInstitution, null);
  assert.equal(canEditPlacementRequest({ role: 'Staff', institution: 'QA', _id: id }, lead), false);
});
