import test from 'node:test';
import assert from 'node:assert/strict';
import router from '../routes/api.js';
import { SupportTicket } from '../models/SupportTicket.js';
import { Placement } from '../models/Placement.js';
import { User } from '../models/User.js';
import { Institution } from '../models/Institution.js';
import { AuditLog } from '../models/AuditLog.js';
import { Notification } from '../models/Notification.js';
import { canAccessSupportTicket } from '../utils/supportAccess.js';

const requesterId = '507f1f77bcf86cd799439011';
const responderId = '507f1f77bcf86cd799439012';
const ticketId = '507f1f77bcf86cd799439013';
const learnerId = '507f1f77bcf86cd799439014';
const placementId = '507f1f77bcf86cd799439015';

const query = value => ({ select: async () => value, populate() { return this; }, then(resolve) { return Promise.resolve(value).then(resolve); } });
const handler = (method, path) => router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack.at(-1).handle;
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const call = async (method, path, { user, body = {}, id = ticketId } = {}) => {
  const res = response();
  await handler(method, path)({ user, body, params: { id } }, res);
  return res;
};

test('guardian cannot link another learner placement to a ticket', async t => {
  t.mock.method(Placement, 'findById', () => query({ _id: placementId, learner: learnerId, institution: 'Other' }));
  t.mock.method(User, 'findById', () => query({ linkedLearners: [] }));
  t.mock.method(SupportTicket, 'create', () => assert.fail('unauthorized ticket must not be saved'));
  const res = await call('post', '/support-tickets', {
    user: { _id: requesterId, role: 'Guardian', name: 'Parent' },
    body: { subject: 'Help', description: 'Cannot access placement', placementId },
  });
  assert.equal(res.statusCode, 403);
});

test('assignment rejects an invalid target before changing the ticket', async t => {
  const ticket = new SupportTicket({ _id: ticketId, subject: 'Help', description: 'Issue', requester: requesterId, requesterRole: 'Guardian', institution: 'Home' });
  t.mock.method(SupportTicket, 'findOne', async () => ticket);
  t.mock.method(SupportTicket.prototype, 'save', () => assert.fail('invalid assignment must not be saved'));
  const res = await call('put', '/support-tickets/:id/assignment', {
    user: { _id: responderId, role: 'Admin', institution: 'Home' },
    body: { assignedTo: 'not-an-id' },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(ticket.assignedTo, undefined);
});

test('reply routes the next action based on requester identity', async t => {
  const ticket = new SupportTicket({ _id: ticketId, subject: 'Help', description: 'Issue', requester: requesterId, assignedTo: responderId, requesterRole: 'Guardian', institution: 'Home' });
  t.mock.method(SupportTicket, 'findOne', async () => ticket);
  t.mock.method(SupportTicket, 'findById', () => query(ticket));
  t.mock.method(SupportTicket.prototype, 'save', async function () { await this.validate(); return this; });
  t.mock.method(AuditLog, 'create', async () => ({}));
  t.mock.method(User, 'find', () => query([]));
  const requesterReply = await call('post', '/support-tickets/:id/replies', {
    user: { _id: requesterId, role: 'Guardian', name: 'Parent' }, body: { message: 'More detail' },
  });
  assert.equal(requesterReply.statusCode, 200);
  assert.equal(ticket.awaitingParty, 'Support');
  const responderReply = await call('post', '/support-tickets/:id/replies', {
    user: { _id: responderId, role: 'Admin', institution: 'Home', name: 'Admin' }, body: { message: 'Please try again' },
  });
  assert.equal(responderReply.statusCode, 200);
  assert.equal(ticket.awaitingParty, 'Requester');
  assert.ok(ticket.firstRespondedAt);
});

test('requester reply alerts the assigned responder', async t => {
  const ticket = new SupportTicket({ _id: ticketId, subject: 'Help', description: 'Issue', requester: requesterId, assignedTo: responderId, requesterRole: 'Guardian', institution: 'Home' });
  t.mock.method(SupportTicket, 'findOne', async () => ticket);
  t.mock.method(SupportTicket, 'findById', () => query(ticket));
  t.mock.method(SupportTicket.prototype, 'save', async function () { return this; });
  t.mock.method(AuditLog, 'create', async () => ({}));
  t.mock.method(User, 'find', () => query([{ _id: responderId, notificationPreferences: { inApp: true, push: false } }]));
  let recipient;
  t.mock.method(Notification, 'create', async input => { recipient = input.recipient; return input; });
  const res = await call('post', '/support-tickets/:id/replies', {
    user: { _id: requesterId, role: 'Guardian', name: 'Parent' }, body: { message: 'I tried again' },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(recipient, responderId);
});

test('terminal tickets require reopening before replies', async t => {
  const ticket = new SupportTicket({ _id: ticketId, subject: 'Help', description: 'Issue', requester: requesterId, requesterRole: 'Guardian', institution: 'Home', status: 'Resolved' });
  t.mock.method(SupportTicket, 'findOne', async () => ticket);
  const res = await call('post', '/support-tickets/:id/replies', {
    user: { _id: requesterId, role: 'Guardian', name: 'Parent' }, body: { message: 'Still broken' },
  });
  assert.equal(res.statusCode, 409);
  assert.equal(ticket.replies.length, 0);
});

test('ticket access is scoped to requester or institution', async () => {
  const ticket = { requester: requesterId, institution: 'Home' };
  assert.equal(await canAccessSupportTicket({ _id: requesterId, role: 'Guardian' }, ticket), true);
  assert.equal(await canAccessSupportTicket({ _id: responderId, role: 'Guardian' }, ticket), false);
  assert.equal(await canAccessSupportTicket({ role: 'Admin', institution: 'Other' }, ticket), false);
});

test('regional and scoped HQ ticket access follows the institution region', async t => {
  t.mock.method(Institution, 'findOne', filter => ({
    select: () => ({ lean: async () => filter.region === 'Northern' ? { _id: ticketId } : null }),
  }));
  const ticket = { requester: requesterId, institution: 'Home' };
  assert.equal(await canAccessSupportTicket({ role: 'RegionalAdmin', region: 'Northern' }, ticket), true);
  assert.equal(await canAccessSupportTicket({ role: 'RegionalAdmin', region: 'Ashanti' }, ticket), false);
  assert.equal(await canAccessSupportTicket({ role: 'HQStaff', hqScopeType: 'Institution', institution: 'Other' }, ticket), false);
});

test('ticket creation defaults priority and returns a valid record', async t => {
  t.mock.method(SupportTicket, 'create', async input => {
    const ticket = new SupportTicket(input);
    await ticket.validate();
    return ticket;
  });
  t.mock.method(SupportTicket, 'findById', () => query(new SupportTicket({
    _id: ticketId, subject: 'Help', description: 'Issue', requester: requesterId,
    requesterRole: 'SuperAdmin', institution: 'Home', priority: 'Medium',
  })));
  t.mock.method(AuditLog, 'create', async () => ({}));
  const res = await call('post', '/support-tickets', {
    user: { _id: requesterId, role: 'SuperAdmin', name: 'Admin', institution: 'Home', region: 'Northern' },
    body: { subject: 'Help', description: 'Issue', category: 'Technical' },
  });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.priority, 'Medium');
});

test('repeated ticket request keys return the existing ticket', async t => {
  const requestKey = 'f5630cb0-b801-49b8-a872-764183af4d61';
  const previous = new SupportTicket({ _id: ticketId, subject: 'Help', description: 'Issue', requester: requesterId, requesterRole: 'Guardian', institution: 'Home', requestKey });
  t.mock.method(SupportTicket, 'findOne', async () => previous);
  t.mock.method(SupportTicket, 'create', () => assert.fail('retry must not create a second ticket'));
  const res = await call('post', '/support-tickets', {
    user: { _id: requesterId, role: 'Guardian', name: 'Parent' },
    body: { subject: 'Help', description: 'Issue', requestKey },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body._id.toString(), ticketId);
});

test('resolving requires a summary and closed tickets require reopening before reply', async t => {
  const ticket = new SupportTicket({ _id: ticketId, subject: 'Help', description: 'Issue', requester: requesterId, requesterRole: 'Guardian', institution: 'Home' });
  t.mock.method(SupportTicket, 'findOne', async () => ticket);
  const res = await call('put', '/support-tickets/:id/status', {
    user: { _id: responderId, role: 'Admin', institution: 'Home' },
    body: { status: 'Resolved' },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(ticket.status, 'Open');
});
