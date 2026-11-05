import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import router from '../routes/api.js';
import { SupportTicket } from '../models/SupportTicket.js';
import { Learner } from '../models/Learner.js';
import { Placement } from '../models/Placement.js';
import { AuditLog } from '../models/AuditLog.js';

const handler = (method, path) => router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack.at(-1).handle;
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test('support Mongo workflow: concurrent retries, scoped context, filters and ordering', { skip: process.env.SUPPORT_MONGO_INTEGRATION !== '1' }, async t => {
  // Deliberately fixed localhost port and disposable database; no production URI.
  await mongoose.connect(`mongodb://127.0.0.1:27039/wel_support_qa_${Date.now()}`, { autoIndex: false, serverSelectionTimeoutMS: 5000 });
  try {
    const actor = { _id: new mongoose.Types.ObjectId(), name: 'Institution Officer', role: 'Admin', institution: 'School A' };
    let audits = 0;
    t.mock.method(AuditLog, 'create', async () => { audits++; return {}; });
    // The disposable database has no user accounts or notification recipients.
    const ticket = await SupportTicket.create({ subject: 'Help', description: 'Issue', requester: actor._id, requesterRole: actor.role, institution: 'School A', region: 'Ashanti', priority: 'Low' });
    const send = async (message = 'More detail') => {
      const res = response();
      await handler('post', '/support-tickets/:id/replies')({ user: actor, params: { id: ticket.id }, body: { message, requestKey: 'f5630cb0-b801-49b8-a872-764183af4d61' } }, res);
      return res;
    };
    const concurrent = await Promise.all(Array.from({ length: 6 }, () => send()));
    assert.ok(concurrent.every(res => [200, 409].includes(res.statusCode)));
    assert.equal((await SupportTicket.findById(ticket._id)).replies.length, 1);
    assert.equal(audits, 1);
    assert.equal((await send()).statusCode, 200);
    assert.equal((await send('Different message')).statusCode, 409);
    assert.equal(audits, 1);

    const homeLearner = new mongoose.Types.ObjectId();
    const foreignLearner = new mongoose.Types.ObjectId();
    await Learner.collection.insertMany([
      { _id: homeLearner, firstName: 'Ama', lastName: 'Learner', trackingId: 'QA-A', institution: 'School A' },
      { _id: foreignLearner, firstName: 'Other', lastName: 'Learner', trackingId: 'QA-B', institution: 'School B' },
    ]);
    await Placement.collection.insertMany([
      { learner: homeLearner, companyName: 'Home Workshop', institution: 'School A', status: 'Active' },
      { learner: foreignLearner, companyName: 'Foreign Workshop', institution: 'School B', status: 'Active' },
    ]);
    const context = async learnerId => {
      const res = response();
      await handler('get', '/support-context')({ user: actor, query: { search: 'Learner', learnerId: String(learnerId) } }, res);
      return res;
    };
    const home = await context(homeLearner);
    assert.equal(home.statusCode, 200);
    assert.deepEqual(home.body.learners.map(learner => learner.trackingId), ['QA-A']);
    assert.deepEqual(home.body.placements.map(placement => placement.companyName), ['Home Workshop']);
    assert.equal((await context(foreignLearner)).statusCode, 404);

    await SupportTicket.create({ subject: 'Urgent problem', description: 'Issue', requester: actor._id, requesterRole: actor.role, institution: 'School A', region: 'Ashanti', priority: 'Urgent', ticketType: 'Incident' });
    await SupportTicket.create({ subject: 'Foreign ticket', description: 'Issue', requester: actor._id, requesterRole: actor.role, institution: 'School B', region: 'Ahafo', priority: 'Urgent' });
    const list = async query => {
      const res = response();
      await handler('get', '/support-tickets')({ user: actor, query: { page: '1', pageSize: '10', ...query } }, res);
      return res;
    };
    const ordered = await list({ sort: 'priority' });
    assert.equal(ordered.statusCode, 200);
    assert.deepEqual(ordered.body.items.map(item => item.priority), ['Urgent', 'Low']);
    assert.equal((await list({ institution: 'School B' })).body.total, 0);
    assert.equal((await list({ region: 'Ahafo' })).body.total, 0);
    assert.deepEqual((await list({ ticketType: 'Incident' })).body.items.map(item => item.subject), ['Urgent problem']);
    assert.equal((await list({ search: ticket.id })).body.total, 1);
    assert.equal((await list({ search: '.*' })).body.total, 0, 'search is literal');
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
