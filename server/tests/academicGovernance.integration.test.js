import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import router from '../routes/api.js';
import { AcademicState } from '../models/AcademicState.js';
import { AcademicTerm } from '../models/AcademicTerm.js';
import { currentAcademicTerm } from '../utils/academicGovernance.js';

// Opt-in only: use a fresh, disposable local mongod on this dedicated port.
test('standalone MongoDB: HQ creation, institution visibility, validation and atomic rollover', { skip: process.env.ACADEMIC_MONGO_INTEGRATION !== '1' }, async () => {
  await mongoose.connect('mongodb://127.0.0.1:27029/academic_governance_qa', { serverSelectionTimeoutMS: 3000 });
  try {
    assert.equal(await AcademicTerm.countDocuments(), 0, 'Use a fresh disposable QA database');
    const user = { _id: new mongoose.Types.ObjectId(), role: 'SuperAdmin', name: 'Academic QA' };
    const call = async (path, method, body = {}, params = {}, actor = user, query = {}) => {
      const handler = router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack.at(-1).handle;
      const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.body = data; return this; } };
      await handler({ body, params, user: actor, query }, res);
      return res;
    };
    const base = { name: 'QA Semester 1', academicYear: '2020/2021', termType: 'Semester 1', startDate: '2020-01-01', endDate: '2020-05-31', status: 'Active', isCurrent: true };
    const first = await call('/academic-terms', 'post', base);
    assert.equal(first.code, 201, JSON.stringify(first.body));
    assert.equal(first.body.isCurrent, true);
    const firstId = String(first.body._id);
    assert.equal(String((await currentAcademicTerm())._id), firstId);
    const invalid = await call('/academic-terms', 'post', { ...base, termType: 'Semester 2', endDate: '2019-01-01' });
    assert.equal(invalid.code, 409);
    assert.equal(String((await currentAcademicTerm())._id), firstId);
    const partial = await call('/academic-terms/:id', 'put', { startDate: '2022-01-01' }, { id: firstId });
    assert.equal(partial.code, 400);
    assert.equal((await AcademicTerm.findById(firstId)).startDate.toISOString(), '2020-01-01T00:00:00.000Z');
    const window = await call('/academic-calendar', 'post', { title: 'QA WEL', eventType: 'WEL Window', startDate: '2020-02-01', endDate: '2020-04-30', semester: 'Semester 1', academicYear: base.academicYear, institutionCalendarType: 'Single Track', targetYearGroup: 'Year 3', isActive: true });
    assert.equal(window.code, 201, JSON.stringify(window.body));
    const conflict = await call('/academic-terms/:id', 'put', { endDate: '2020-03-01' }, { id: firstId });
    assert.equal(conflict.code, 409);
    const calendar = await call('/calendar/events', 'get', {}, {}, { ...user, role: 'Staff', institution: 'QA Institution' }, { start: '2020-01-01', end: '2020-12-31' });
    assert.equal(calendar.code, 200, JSON.stringify(calendar.body));
    assert.ok(calendar.body.some(event => event.id === `term-start-${firstId}`));
    assert.ok(calendar.body.some(event => event.title === 'QA WEL'));
    const next = await call('/academic-terms', 'post', { ...base, name: 'QA Semester 2', termType: 'Semester 2', startDate: '2020-06-01', endDate: '2020-12-31', status: 'Planned', isCurrent: false });
    assert.equal(next.code, 201, JSON.stringify(next.body));
    const rolled = await call('/settings/rollover/semester', 'post', { nextTermId: String(next.body._id) });
    assert.equal(rolled.code, 200, JSON.stringify(rolled.body));
    const listed = await call('/academic-terms', 'get');
    assert.equal(listed.body.filter(term => term.isCurrent).length, 1);
    assert.equal(listed.body.find(term => String(term._id) === firstId).status, 'Completed');
    assert.equal(String((await AcademicState.findById('global')).currentTerm), String(next.body._id));
    assert.equal((await call('/academic-terms/:id', 'delete', {}, { id: String(next.body._id) })).code, 409);
    console.log('Standalone MongoDB workflow verified; only disposable QA data was written.');
  } finally { await mongoose.disconnect(); }
});
