import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import router from '../routes/api.js';
import { AcademicCalendar } from '../models/AcademicCalendar.js';
import { AcademicTerm } from '../models/AcademicTerm.js';
import { AcademicState } from '../models/AcademicState.js';
import { SemesterReport } from '../models/SemesterReport.js';
import { AuditLog } from '../models/AuditLog.js';
import { activateTerm, effectiveTerm, getAcademicState, pickFields, calendarFields, termCalendarEvents, validateWindowTerm, validateTermWindows } from '../utils/academicGovernance.js';

const id = () => new mongoose.Types.ObjectId();
const termData = () => ({ name: 'Semester One', academicYear: '2026/2027', termType: 'Semester 1', startDate: '2026-09-01', endDate: '2027-02-28', createdBy: id() });
const eventData = () => ({ title: 'Window', startDate: '2026-09-07', endDate: '2026-12-12', eventType: 'WEL Window', semester: 'Semester 1', academicYear: '2026/2027', institutionCalendarType: 'Single Track', targetYearGroup: 'Year 3', createdBy: id() });
const route = (path, method) => router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route;
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
function mockLock(t, state = { currentTerm: null, completedTerms: [], lockToken: 'test' }) {
  t.mock.method(AcademicState, 'findById', () => ({ lean: async () => state }));
  t.mock.method(AcademicState, 'findOneAndUpdate', () => ({ lean: async () => state }));
  t.mock.method(AcademicState, 'updateOne', async () => ({}));
  return state;
}

test('calendar validation works with Mongoose 9 and rejects dates and incomplete WEL scope', async () => {
  await new AcademicCalendar(eventData()).validate();
  await new AcademicCalendar({ ...eventData(), eventType: 'Holiday' }).validate();
  for (const bad of [{ endDate: '2026-01-01' }, { semester: 'invalid' }, { academicYear: '2026/2028' }, { institutionCalendarType: 'All' }, { targetYearGroup: 'All' }]) {
    await assert.rejects(new AcademicCalendar({ ...eventData(), ...bad }).validate(), { name: 'ValidationError' });
  }
});

test('term validation checks merged partial updates and consecutive academic years', async () => {
  const term = new AcademicTerm(termData());
  await term.validate();
  term.startDate = '2027-03-01';
  await assert.rejects(term.validate(), /End date cannot/);
  await assert.rejects(new AcademicTerm({ ...termData(), academicYear: '2026/2029' }).validate(), /consecutive/);
});

test('calendar and term mutations deny all non-SuperAdmin roles before database access', () => {
  for (const [path, method] of [['/academic-calendar', 'post'], ['/academic-calendar/:id', 'put'], ['/academic-calendar/:id', 'delete'], ['/academic-calendar/bootstrap-wel-template', 'post'], ['/academic-terms', 'post'], ['/academic-terms/:id', 'put'], ['/academic-terms/:id', 'delete']]) {
    const guard = route(path, method).stack[0].handle;
    for (const role of ['HQManager', 'HQStaff', 'RegionalAdmin', 'Admin', 'Manager', 'Staff', 'Learner', 'IndustryPartner']) {
      const res = response();
      guard({ user: { role } }, res, () => assert.fail('Unauthorized mutation'));
      assert.equal(res.code, 403);
    }
    let allowed = false;
    guard({ user: { role: 'SuperAdmin' } }, response(), () => { allowed = true; });
    assert.ok(allowed);
  }
});

test('calendar allowlist excludes ownership, IDs and arbitrary update operators', () => {
  assert.deepEqual(pickFields({ title: 'New', createdBy: 'attacker', _id: 'other', $set: { isActive: true } }, calendarFields), { title: 'New' });
});

test('one pointer overrides legacy flags and rollover atomically completes the outgoing term', async t => {
  const oldId = id(), nextId = id();
  const state = { currentTerm: oldId, completedTerms: [], lockToken: 'token' };
  const next = { ...termData(), _id: nextId, startDate: '2027-03-01', status: 'Planned' };
  t.mock.method(AcademicState, 'findOneAndUpdate', (filter, update) => {
    assert.equal(filter.currentTerm, oldId);
    assert.equal(filter.lockToken, 'token');
    assert.ok(filter.lockUntil.$gt instanceof Date);
    assert.equal(update.$set.currentTerm, nextId);
    assert.equal(update.$addToSet.completedTerms, oldId);
    return { lean: async () => ({ ...state, currentTerm: nextId, completedTerms: [oldId] }) };
  });
  assert.equal((await activateTerm(next, state, { _id: oldId, endDate: '2027-02-28' })).status, 'Active');
  assert.deepEqual(effectiveTerm({ _id: oldId, isCurrent: true, status: 'Active' }, { currentTerm: nextId, completedTerms: [oldId] }), { _id: oldId, isCurrent: false, status: 'Completed' });
});

test('rollover rejects earlier, completed and stale requests', async t => {
  const state = { currentTerm: id(), completedTerms: [], lockToken: 'token' };
  const term = { ...termData(), _id: id(), status: 'Planned' };
  await assert.rejects(activateTerm(term, state, { _id: state.currentTerm, endDate: '2027-01-01' }), /must start after/);
  await assert.rejects(activateTerm({ ...term, status: 'Completed' }, state), /planned term/);
  await assert.rejects(activateTerm(term, { ...state, completedTerms: [term._id] }), /planned term/);
  t.mock.method(AcademicState, 'findOneAndUpdate', () => ({ lean: async () => null }));
  await assert.rejects(activateTerm(term, state), /Refresh and retry/);
});

test('ambiguous legacy current terms fail closed without choosing a winner', async t => {
  t.mock.method(AcademicState, 'findById', () => ({ lean: async () => null }));
  t.mock.method(AcademicTerm, 'find', () => ({ sort() { return this; }, lean: async () => [{ _id: id(), isCurrent: true }, { _id: id(), isCurrent: true }] }));
  await assert.rejects(getAcademicState(), /Multiple legacy/);
});

test('active WEL windows require exactly one enclosing term while drafts remain editable', async t => {
  let terms = [];
  t.mock.method(AcademicTerm, 'find', () => ({ lean: async () => terms }));
  await validateWindowTerm({ ...eventData(), isActive: false });
  await assert.rejects(validateWindowTerm({ ...eventData(), isActive: true }), /exactly one/);
  terms = [termData()];
  await validateWindowTerm({ ...eventData(), isActive: true });
  await assert.rejects(validateWindowTerm({ ...eventData(), isActive: true, endDate: '2027-03-01' }), error => {
    assert.equal(error.status, 409);
    assert.match(error.message, /2026-09-01 to 2027-02-28/);
    assert.match(error.message, /2027-03-01/);
    assert.match(error.message, /save as a draft/);
    return true;
  });
  t.mock.method(AcademicCalendar, 'find', () => ({ lean: async () => [eventData()] }));
  await assert.rejects(validateTermWindows({ ...termData(), startDate: '2026-10-01' }), /include the active WEL/);
});

test('term delete protects current terms and report references without deleting data', async t => {
  const term = new AcademicTerm(termData());
  const state = mockLock(t, { currentTerm: term._id, completedTerms: [], lockToken: 'test' });
  t.mock.method(AcademicTerm, 'findById', async () => term);
  const handler = route('/academic-terms/:id', 'delete').stack.at(-1).handle;
  const req = { params: { id: String(term._id) }, user: { role: 'SuperAdmin' } };
  let res = response();
  await handler(req, res);
  assert.equal(res.code, 409);
  assert.match(res.body.message, /current term/);
  state.currentTerm = null;
  t.mock.method(SemesterReport, 'exists', async () => ({ _id: id() }));
  res = response();
  await handler(req, res);
  assert.equal(res.code, 409);
  assert.match(res.body.message, /closure reports/);
  assert.equal(term.archived, false);
});

test('term update cannot bypass validation by sending only one date or replace current directly', async t => {
  const term = new AcademicTerm(termData());
  const state = mockLock(t);
  t.mock.method(AcademicTerm, 'findById', async () => term);
  t.mock.method(SemesterReport, 'exists', async () => null);
  const handler = route('/academic-terms/:id', 'put').stack.at(-1).handle;
  const req = { params: { id: String(term._id) }, user: { _id: id() }, body: { startDate: '2028-01-01' } };
  let res = response();
  await handler(req, res);
  assert.equal(res.code, 400);
  assert.match(res.body.message, /End date/);
  state.currentTerm = id();
  req.body = { isCurrent: true, status: 'Active' };
  res = response();
  await handler(req, res);
  assert.equal(res.code, 409);
  assert.match(res.body.message, /rollover/);
});

test('Settings terms produce stable institution-calendar boundaries', () => {
  const term = { ...termData(), _id: id() };
  const events = termCalendarEvents([term]);
  assert.equal(events.length, 2);
  assert.equal(events[0].start, term.startDate);
  assert.equal(events[1].start, term.endDate);
  assert.equal(events[0].eventType, 'Semester Start');
  assert.match(events[0].description, /Academic Terms in Settings/);
});

test('template creation shifts years, creates only drafts and preserves existing window edits on repeat', async t => {
  mockLock(t);
  t.mock.method(AuditLog, 'create', async () => ({}));
  const records = new Map();
  t.mock.method(AcademicCalendar, 'findOneAndUpdate', async (filter, update) => {
    assert.deepEqual(Object.keys(update), ['$setOnInsert']);
    const key = JSON.stringify(filter);
    if (!records.has(key)) records.set(key, { ...update.$setOnInsert });
    return records.get(key);
  });
  const handler = route('/academic-calendar/bootstrap-wel-template', 'post').stack.at(-1).handle;
  const req = { body: { academicYear: '2027/2028' }, user: { _id: id(), role: 'SuperAdmin' } };
  let res = response();
  await handler(req, res);
  assert.equal(res.code, 200);
  assert.equal(records.size, 6);
  for (const record of records.values()) {
    assert.equal(record.isActive, false);
    assert.ok([2027, 2028].includes(record.startDate.getUTCFullYear()));
    assert.ok([2027, 2028].includes(record.endDate.getUTCFullYear()));
  }
  const existing = records.values().next().value;
  existing.title = 'HQ reviewed title';
  existing.startDate = new Date('2027-09-10');
  existing.isActive = true;
  res = response();
  await handler(req, res);
  assert.equal(res.code, 200);
  assert.equal(existing.title, 'HQ reviewed title');
  assert.equal(existing.startDate.toISOString(), '2027-09-10T00:00:00.000Z');
  assert.equal(existing.isActive, true);
  assert.equal(records.size, 6);
});
