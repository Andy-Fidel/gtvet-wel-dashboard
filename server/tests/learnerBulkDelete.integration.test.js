import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import router from '../routes/api.js';
import { csrfProtection, JWT_SECRET } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { Learner } from '../models/Learner.js';
import { AuditLog } from '../models/AuditLog.js';
import { createAuthSession } from '../utils/authSessions.js';
import { withUserManagementLock } from '../utils/userManagement.js';

test('MongoDB and HTTP: selected learners delete safely, protect references, enforce scope, and retry without duplicate effects', { skip: process.env.LEARNER_MONGO_INTEGRATION !== '1' }, async () => {
  const database = `wel_learner_bulk_delete_qa_${Date.now()}`;
  await mongoose.connect(`mongodb://127.0.0.1:27032/${database}`, { autoIndex: false, serverSelectionTimeoutMS: 5000 });
  let server;
  try {
    const app = express(); app.use(express.json()); app.use(csrfProtection); app.use('/api', router);
    server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const clients = {};
    for (const role of ['Admin', 'Manager', 'Staff', 'SuperAdmin', 'RegionalAdmin', 'HQStaff', 'Guardian', 'IndustryPartner']) {
      const user = await User.create({ name: `QA ${role}`, email: `${role}@example.invalid`, password: 'QA-password-123', role, institution: role === 'SuperAdmin' ? '' : 'QA', region: 'Ashanti', passwordChangeRequired: false, ...(role === 'IndustryPartner' ? { partnerId: new mongoose.Types.ObjectId() } : {}) });
      if (role === 'IndustryPartner') await mongoose.model('IndustryPartner').collection.insertOne({ _id: user.partnerId, name: 'QA Partner' });
      const session = await createAuthSession(user, { headers: {} });
      const token = jwt.sign({ userId: String(user._id), sid: String(session._id) }, JWT_SECRET, { expiresIn: '1h' });
      clients[role] = async (ids, { method = 'POST', path = '/learners/bulk-delete' } = {}) => {
        const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}`, cookie: 'gtvets_csrf=qa', 'X-CSRF-Token': 'qa' }, body: JSON.stringify({ learnerIds: ids }) });
        return { status: res.status, body: await res.json() };
      };
    }
    const insert = async (institution = 'QA') => {
      const id = new mongoose.Types.ObjectId();
      await Learner.collection.insertOne({ _id: id, firstName: 'QA', lastName: 'Learner', institution, workflowVersion: 0 });
      return String(id);
    };
    const free = await insert(), foreign = await insert('Other Institution'), missing = String(new mongoose.Types.ObjectId());
    for (const role of ['RegionalAdmin', 'HQStaff', 'Guardian', 'IndustryPartner']) assert.equal((await clients[role]([free])).status, 403, role);
    assert.equal((await clients.Admin([])).status, 400);
    assert.equal((await clients.Admin([free, free.toUpperCase()])).status, 400);
    await withUserManagementLock(async () => {
      assert.equal((await clients.Admin([free])).status, 409);
      // These handlers must not introduce a first reference while deletion is
      // checking whether the learner is unreferenced.
      for (const path of ['/monitoring-visits', '/placement-requests', '/semester-reports/initiate', '/semester-reports/generate', '/users']) {
        assert.equal((await clients.Admin([free], { path })).status, 409, path);
      }
    });

    const blocked = [];
    for (const [model, field] of [['Placement', 'learner'], ['PlacementTransfer', 'learner'], ['PlacementRequest', 'learners'], ['MonitoringVisit', 'learner'], ['CompetencyAssessment', 'learner'], ['EmployerEvaluation', 'learner'], ['AttendanceLog', 'learner'], ['GuardianConsent', 'learner'], ['PlacementAgreement', 'learner'], ['Document', 'learner'], ['SupportTicket', 'learner']]) {
      const id = await insert(); blocked.push(id);
      await mongoose.model(model).collection.insertOne({ [field]: field === 'learners' ? [new mongoose.Types.ObjectId(id)] : new mongoose.Types.ObjectId(id), status: 'Completed' });
    }
    const guardianLinked = await insert(), cohort = await insert(), exception = await insert();
    blocked.push(guardianLinked, cohort, exception);
    await User.updateOne({ role: 'Guardian' }, { $set: { linkedLearners: [guardianLinked] } });
    await mongoose.model('SemesterReport').collection.insertOne({ cohortLearners: [{ learner: new mongoose.Types.ObjectId(cohort) }], exceptions: [{ learnerId: new mongoose.Types.ObjectId(exception) }] });
    const result = await clients.Admin([free.toUpperCase(), foreign, missing, ...blocked]);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.deepEqual(result.body.deletedIds, [free]);
    assert.equal(result.body.deletedCount, 1);
    assert.equal(result.body.skipped.length, blocked.length + 2);
    assert.equal(await Learner.findById(free), null);
    assert.ok(await Learner.findById(foreign));
    assert.equal(await Learner.countDocuments({ _id: { $in: blocked } }), blocked.length);
    assert.equal(result.body.skipped.find(item => item.id === foreign).name, undefined);
    assert.equal(await AuditLog.countDocuments({ entityType: 'Learner', action: 'DELETE' }), 1);
    const retry = await clients.Admin([free]);
    assert.equal(retry.body.deletedCount, 0);
    assert.equal(await AuditLog.countDocuments({ entityType: 'Learner', action: 'DELETE' }), 1);
    assert.equal((await clients.Admin([], { method: 'DELETE', path: `/learners/${blocked[0]}` })).status, 409);
    assert.equal((await clients.Admin([], { method: 'DELETE', path: `/learners/${foreign}` })).status, 404);
    for (const role of ['Manager', 'Staff']) {
      const id = await insert();
      assert.equal((await clients[role]([id])).body.deletedCount, 1);
      assert.equal(await Learner.findById(id), null);
    }
    const untouched = await insert('Other Institution');
    const cleanup = await clients.SuperAdmin([foreign, blocked[0]]);
    assert.equal(cleanup.status, 200);
    assert.deepEqual(cleanup.body.deletedIds, [foreign]);
    assert.equal(cleanup.body.skipped[0].id, blocked[0]);
    assert.ok(await Learner.findById(untouched), 'Unselected learners must remain');
    assert.equal((await AuditLog.findOne({ entityType: 'Learner', entityId: foreign })).institution, 'Other Institution');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    assert.equal(mongoose.connection.name, database);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
