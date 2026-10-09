import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import router from '../routes/api.js';
import { IndustryPartner } from '../models/IndustryPartner.js';
import { Placement } from '../models/Placement.js';
import { partnerCapacityAt } from '../utils/partnerCapacity.js';

const uri = process.env.GTVET_HEALTH_TEST_URI;
test('national directory defaults to institution region, filters capacity before pagination and permits cross-region placement safely', { skip: !uri }, async () => {
  const target = new URL(uri); assert.equal(target.hostname, '127.0.0.1'); assert.equal(target.pathname, '/gtvet_system_health_test');
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 3000 });
  try {
    await mongoose.connection.db.dropDatabase();
    const db = mongoose.connection.db, id = () => new mongoose.Types.ObjectId();
    const user = { _id: id(), institution: 'QA Accra', role: 'Admin', region: 'Ashanti', name: 'QA Admin' };
    await db.collection('institutions').insertOne({ name: user.institution, region: 'G. Accra', calendarType: 'Single Track' });
    const home = id(), away = id(), full = id(), reservedOther = id(), pending = id(), own = id();
    const base = { sector: 'Automotive', totalSlots: 5, usedSlots: 0, status: 'Active', approvalStatus: 'Approved', region: 'Ashanti', createdAt: new Date(), institutionDetails: [{ institution: 'Other', notes: 'PRIVATE' }], changeRequests: [] };
    await IndustryPartner.collection.insertMany([
      { ...base, _id: home, name: 'Home QA', region: 'Greater Accra' },
      { ...base, _id: away, name: 'Away QA', town: 'Suame', coordinates: { lat: 6.68, lng: -1.62, precision: 'Town', townName: 'Kumasi' } },
      { ...base, _id: full, name: 'Full QA', totalSlots: 1 },
      { ...base, _id: reservedOther, name: 'Reserved elsewhere QA', totalSlots: 2 },
      { ...base, _id: pending, name: 'Hidden pending QA', approvalStatus: 'PendingHQApproval', linkedInstitutions: ['Other'] },
      { ...base, _id: own, name: 'Own rejected QA', approvalStatus: 'Rejected', linkedInstitutions: [user.institution], submittedByInstitution: user.institution },
    ]);
    await Placement.collection.insertOne({ partner: full, learner: id(), institution: 'Other', status: 'Active' });
    await db.collection('partnerslotallocations').insertMany([
      { partner: reservedOther, institution: 'Other', slots: 2, status: 'Approved', startDate: new Date('2020-01-01'), endDate: new Date('2040-01-01') },
      { partner: away, institution: user.institution, slots: 2, status: 'Approved', startDate: new Date('2020-01-01'), endDate: new Date('2040-01-01') },
    ]);
    const call = async (path, method = 'get', query = {}, body = {}, actor = user, params = {}) => {
      const handler = router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack.at(-1).handle;
      const response = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
      await handler({ user: actor, query, body, params }, response); return response;
    };
    const defaults = await call('/industry-partners', 'get', { directory: '1', page: '1' });
    assert.equal(defaults.code, 200); assert.equal(defaults.body.institutionRegion, 'Greater Accra'); assert.equal(defaults.body.selectedRegion, 'Greater Accra'); assert.equal(defaults.body.total, 1);
    const all = await call('/industry-partners', 'get', { directory: '1', region: 'all', page: '1', includeAll: '1' });
    assert.equal(all.body.total, 4); assert.ok(all.body.items.every(p => p.institutionDetails === undefined && p.changeRequests === undefined));
    assert.ok(all.body.items.every(p => !p.canRequestChanges));
    const details = await call('/industry-partners/:id/institution-details', 'get', {}, {}, user, { id: String(away) });
    assert.deepEqual(details.body, { version: 0 });
    const unauthorizedChange = await call('/industry-partners/:id/change-requests', 'post', {}, { proposed: { name: 'Forged edit' }, reason: 'QA should not edit unrelated partner' }, user, { id: String(away) });
    assert.equal(unauthorizedChange.code, 403);
    const available = await call('/industry-partners', 'get', { directory: '1', region: 'Ashanti', availableOnly: '1', page: '1', pageSize: '1' });
    assert.equal(available.code, 200, JSON.stringify(available.body)); assert.equal(available.body.total, 1); assert.equal(String(available.body.items[0]._id), String(away));
    const capacity = await partnerCapacityAt({ partner: await IndustryPartner.findById(away), institution: user.institution });
    assert.equal(available.body.items[0].institutionCapacity.availableSlots, capacity.availableSlots);
    const second = await call('/industry-partners', 'get', { directory: '1', region: 'all', availableOnly: '1', page: '2', pageSize: '1' });
    assert.equal(second.body.total, 2); assert.equal(second.body.items.length, 1);
    const searched = await call('/industry-partners', 'get', { directory: '1', region: 'Ashanti', page: '1', q: 'Suame', sector: 'Automotive' });
    assert.equal(searched.body.total, 1);
    const submissions = await call('/industry-partners', 'get', { directory: '1', view: 'submissions', page: '1' });
    assert.equal(submissions.body.total, 1); assert.equal(String(submissions.body.items[0]._id), String(own));
    assert.equal((await call('/industry-partners', 'get', { directory: '1', region: 'Mars', page: '1' })).code, 400);
    const regional = await call('/industry-partners', 'get', { directory: '1', region: 'Greater Accra', page: '1' }, {}, { ...user, role: 'RegionalAdmin', region: 'Ashanti' });
    assert.equal(regional.body.total, 0);
    const guardian = await call('/industry-partners', 'get', { region: 'all', page: '1' }, {}, { ...user, role: 'Guardian' });
    assert.equal(guardian.body.total, 0);

    await Placement.collection.createIndex({ learner: 1 }, { name: 'one_active_placement_per_learner', unique: true, partialFilterExpression: { status: 'Active' } });
    const learner = id(), foreignLearner = id();
    await db.collection('learners').insertMany([{ _id: learner, institution: user.institution, phone: '0000000000', program: 'IT', year: 'Year 1', academicStatus: 'Active', status: 'Pending' }, { _id: foreignLearner, institution: 'Other', phone: '0000000000', program: 'IT', year: 'Year 1', academicStatus: 'Active', status: 'Pending' }]);
    const now = new Date(), year = now.getFullYear() - (now.getMonth() < 7 ? 1 : 0), academicYear = `${year}/${year + 1}`;
    await db.collection('academiccalendars').insertOne({ eventType: 'WEL Window', isActive: true, academicYear, institutionCalendarType: 'Single Track', targetYearGroup: 'Year 1', semester: 'Semester 1', startDate: new Date(now.getTime() - 86400000), endDate: new Date(now.getTime() + 60 * 86400000) });
    const input = { learners: [String(learner)], partner: String(away), coordinates: { lat: 6.68, lng: -1.62, precision: 'Town', townName: 'Kumasi' }, placementRegion: 'Ashanti', startDate: now.toISOString().slice(0, 10), endDate: new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10), academicYear };
    const foreign = await call('/placements', 'post', {}, { ...input, learners: [String(foreignLearner)] }); assert.equal(foreign.code, 400);
    const hidden = await call('/placements', 'post', {}, { ...input, partner: String(pending) }); assert.equal(hidden.code, 400);
    const blocked = await call('/placements', 'post', {}, { ...input, partner: String(reservedOther) }); assert.equal(blocked.code, 409);
    const staffActivation = await call('/placements', 'post', {}, input, { ...user, role: 'Staff' }); assert.equal(staffActivation.code, 403);
    const request = await call('/placement-requests', 'post', {}, { ...input, program: 'IT' }, { ...user, role: 'Staff' }); assert.equal(request.code, 201, JSON.stringify(request.body));
    const editParams = { id: String(request.body._id) };
    const replacementPartner = id(), extraLearner = id();
    await IndustryPartner.collection.insertOne({ ...base, _id: replacementPartner, name: 'Corrected host QA', region: 'Central', totalSlots: 8 });
    await db.collection('learners').insertOne({ _id: extraLearner, institution: user.institution, phone: '0000000000', program: 'IT', year: 'Year 1', academicStatus: 'Active', status: 'Pending' });
    const edits = { sourceVersion: request.body.workflowVersion || 0, partner: String(replacementPartner), learners: [String(learner), String(extraLearner)], placementRegion: 'Central', endDate: new Date(now.getTime() + 31 * 86400000).toISOString().slice(0, 10), coordinates: { lat: 5.1, lng: -1.2, precision: 'Town', townName: 'Cape Coast' }, supervisorName: 'Corrected supervisor', supervisorPhone: '0000000000', requestedSlots: 999, institution: 'Other', status: 'Converted' };
    const deniedEdit = await call('/placement-requests/:id', 'put', {}, edits, { ...user, role: 'Staff', _id: id() }, editParams); assert.equal(deniedEdit.code, 403);
    const foreignEdit = await call('/placement-requests/:id', 'put', {}, edits, { ...user, institution: 'Other' }, editParams); assert.equal(foreignEdit.code, 404);
    const wrongLearner = await call('/placement-requests/:id', 'put', {}, { ...edits, learners: [String(foreignLearner)] }, user, editParams); assert.equal(wrongLearner.code, 400);
    const edited = await call('/placement-requests/:id', 'put', {}, edits, { ...user, role: 'Staff' }, editParams); assert.equal(edited.code, 200, JSON.stringify(edited.body));
    assert.equal(edited.body.supervisorName, 'Corrected supervisor'); assert.equal(edited.body.status, 'Submitted'); assert.equal(edited.body.institution, user.institution); assert.equal(edited.body.requestedSlots, 2);
    assert.equal(String(edited.body.partner._id), String(replacementPartner)); assert.equal(edited.body.placementRegion, 'Central'); assert.equal(edited.body.coordinates.townName, 'Cape Coast');
    assert.equal(await Placement.countDocuments({ learner, status: 'Active' }), 0);
    const retryEdit = await call('/placement-requests/:id', 'put', {}, edits, { ...user, role: 'Staff' }, editParams); assert.equal(retryEdit.code, 200);
    const staleEdit = await call('/placement-requests/:id', 'put', {}, { ...edits, supervisorName: 'Stale' }, user, editParams); assert.equal(staleEdit.code, 409);
    const staleActivation = await call('/placement-requests/:id/convert', 'post', {}, { sourceVersion: 0 }, user, editParams); assert.equal(staleActivation.code, 409);
    const activated = await call('/placement-requests/:id/convert', 'post', {}, {}, user, { id: String(request.body._id) });
    assert.equal(activated.code, 200, JSON.stringify(activated.body));
    const placed = await Placement.findOne({ learner, status: 'Active' }).lean(); assert.equal(placed.institution, user.institution); assert.equal(placed.placementRegion, 'Central'); assert.equal(placed.coordinates.precision, 'Town');
    assert.equal(String(placed.partner), String(replacementPartner)); assert.equal(placed.coordinates.townName, 'Cape Coast'); assert.equal(placed.endDate.toISOString().slice(0, 10), edits.endDate);
    assert.equal(await Placement.countDocuments({ partner: replacementPartner, status: 'Active' }), 2);
    assert.equal(placed.supervisorName, 'Corrected supervisor');
    const afterActivation = await call('/placement-requests/:id', 'put', {}, { sourceVersion: edited.body.workflowVersion, supervisorName: 'Too late' }, user, editParams); assert.equal(afterActivation.code, 403);
  } finally { await mongoose.connection.db.dropDatabase(); await mongoose.disconnect(); }
});
