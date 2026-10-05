import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import router from '../routes/api.js';
import { JWT_SECRET } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { Institution } from '../models/Institution.js';
import { SemesterReport } from '../models/SemesterReport.js';
import { Learner } from '../models/Learner.js';
import { createAuthSession } from '../utils/authSessions.js';

test('overview pipeline includes all report stages and respects national, regional and institution scopes', { skip: process.env.PORTAL_MONGO_INTEGRATION !== '1' }, async () => {
  const database = `wel_portal_overview_qa_${Date.now()}`;
  await mongoose.connect(`mongodb://127.0.0.1:27032/${database}`, { autoIndex: false, serverSelectionTimeoutMS: 5000 });
  let server;
  try {
    await Institution.collection.insertMany([{ name: 'QA Ashanti', region: 'Ashanti' }, { name: 'QA Accra', region: 'Greater Accra' }]);
    await Learner.collection.insertMany([null, '', ' ', undefined, '2026/2027'].map((intakeAcademicYear, index) => ({ firstName: 'QA', lastName: `Learner ${index}`, trackingId: `QA-${index}`, region: 'Ashanti', institution: 'QA Ashanti', academicStatus: 'Active', status: 'Pending', year: 'Year 1', program: 'Electrical', ...(intakeAcademicYear !== undefined ? { intakeAcademicYear } : {}), createdAt: new Date() })));
    const statuses = ['Draft', 'Certified', 'Generated', 'Submitted', 'Regional_Approved', 'HQ_Approved', 'Rejected'];
    await SemesterReport.collection.insertMany(statuses.flatMap(status => ['QA Ashanti', 'QA Accra'].map(institution => ({ institution, status, semester: 'Semester 1', academicYear: '2026/2027', createdAt: new Date(), updatedAt: new Date() }))));
    const app = express(); app.use(express.json()); app.use('/api', router);
    server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
    const base = `http://127.0.0.1:${server.address().port}/api`;
    for (const [role, scope, expectedCount] of [
      ['SuperAdmin', {}, 2],
      ['RegionalAdmin', { region: 'Ashanti' }, 1],
      ['HQManager', { hqScopeType: 'Region', region: 'Ashanti' }, 1],
      ['HQStaff', { hqScopeType: 'Institution', institution: 'QA Accra' }, 1],
      ['HQStaff', { hqScopeType: 'Region', region: 'Volta' }, 0],
    ]) {
      const user = await User.create({ name: 'QA Oversight', email: `${role}-${expectedCount}@example.invalid`, password: 'QA-password-123', passwordChangeRequired: false, role, ...scope });
      const session = await createAuthSession(user, { headers: {} });
      const token = jwt.sign({ userId: String(user._id), sid: String(session._id) }, JWT_SECRET, { expiresIn: '1h' });
      const headers = { authorization: `Bearer ${token}` };
      const response = await fetch(`${base}/admin/overview?refresh=true`, { headers });
      const data = await response.json();
      assert.equal(response.status, 200, JSON.stringify(data));
      assert.equal(data.totalReports, statuses.length * expectedCount, `${role} total`);
      assert.deepEqual(data.reportPipeline, expectedCount ? [...statuses].sort().map(status => ({ status, count: expectedCount })) : [], `${role} scope`);
      for (const key of ['academicSummary', 'intakeCohorts', 'learnerProgressSummary', 'learnerQualitySummary']) assert.ok(data[key], key);
      const progress = await fetch(`${base}/learners/progress/bulk`, { headers });
      assert.equal(progress.status, 200, `${role} progress read access`);
      if (role === 'SuperAdmin' || role === 'RegionalAdmin' || role === 'HQManager') {
        const missing = data.intakeCohorts.find(cohort => cohort.intakeAcademicYear === '__missing_intake__');
        assert.equal(missing.totalLearners, 4);
        assert.equal(missing.needAttentionCount, 4);
        const list = await fetch(`${base}/learners?intakeAcademicYear=__missing_intake__&page=1`, { headers }).then(response => response.json());
        assert.equal(list.total, 4, 'Missing intake drill-down returns the same learners');
        const attention = await fetch(`${base}/learners/progress/bulk?intakeAcademicYear=__missing_intake__&risk=at-risk`, { headers }).then(response => response.json());
        assert.equal(attention.total, missing.needAttentionCount);
        assert.equal(attention.stats.intakeCohorts[0].totalLearners, 4);
        const known = await fetch(`${base}/learners/progress/bulk?intakeAcademicYear=2026%2F2027&risk=at-risk`, { headers }).then(response => response.json());
        assert.equal(known.total, 0);
        assert.equal(known.stats.intakeCohorts[0].totalLearners, 1, 'Cohort totals stay stable when attention list is empty');
      }
      if (role === 'HQManager' || role === 'HQStaff') {
        const write = await fetch(`${base}/learners/507f1f77bcf86cd799439011/owner`, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}' });
        assert.equal(write.status, 403, `${role} cannot assign owners`);
      }
    }
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
