import test from 'node:test';
import assert from 'node:assert/strict';
import { approvalComment, approvalVersionFilter, canResubmitPartner } from '../utils/partnerApproval.js';

test('rejection requires a bounded text reason; approval notes are optional', () => {
  for (const value of [undefined, '', '   ', 'four', {}, 123, 'a'.repeat(3001)]) assert.throws(() => approvalComment(value, true));
  assert.equal(approvalComment('  Missing contact details  ', true), 'Missing contact details');
  assert.equal(approvalComment(undefined, false), '');
  assert.throws(() => approvalComment([], false));
});

test('only submitting management or regional submitter can resubmit rejected registrations', () => {
  const partner = { approvalStatus: 'Rejected', submittedByInstitution: 'QA', addedBy: { _id: 'creator', institution: 'QA' } };
  assert.equal(canResubmitPartner({ role: 'Manager', institution: 'QA' }, partner), true);
  assert.equal(canResubmitPartner({ role: 'Admin', institution: 'Other' }, partner), false);
  assert.equal(canResubmitPartner({ role: 'Staff', institution: 'QA' }, partner), false);
  assert.equal(canResubmitPartner({ role: 'RegionalAdmin', _id: 'creator' }, partner), true);
  assert.equal(canResubmitPartner({ role: 'RegionalAdmin', _id: 'other' }, partner), false);
  assert.equal(canResubmitPartner({ role: 'HQManager' }, partner), false);
  assert.equal(canResubmitPartner({ role: 'SuperAdmin' }, { ...partner, approvalStatus: 'Approved' }), false);
  assert.deepEqual(approvalVersionFilter(0), { $or: [{ approvalVersion: 0 }, { approvalVersion: { $exists: false } }] });
  assert.deepEqual(approvalVersionFilter(3), { approvalVersion: 3 });
});
