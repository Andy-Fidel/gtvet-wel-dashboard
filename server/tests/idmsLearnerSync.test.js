import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIdmsSyncPlan,
  mapIdmsLearner,
  normalizeIndexNumber,
} from '../utils/idmsLearnerSync.js';

const remoteLearner = (overrides = {}) => ({
  public_id: 'idms-learner-1',
  first_name: 'Ama',
  middle_name: '',
  last_name: 'Mensah',
  gender: 'Female',
  date_of_birth: '2008-04-10',
  index_number: 'GTVET / 2026 / 001',
  programme_id: 'programme-1',
  programme: 'Electrical Installation',
  current_year: 2,
  intake_year: 2025,
  status: 'active',
  updated_at: '2026-09-15T10:00:00Z',
  ...overrides,
});

test('maps the IDMS integration learner contract into WEL academic fields', () => {
  const { mapped, errors } = mapIdmsLearner(remoteLearner(), { academicYear: '2026/2027' });
  assert.deepEqual(errors, []);
  assert.equal(mapped.idmsLearnerId, 'idms-learner-1');
  assert.equal(mapped.indexNumber, 'GTVET / 2026 / 001');
  assert.equal(mapped.program, 'Electrical Installation');
  assert.equal(mapped.year, 'Year 2');
  assert.equal(mapped.intakeAcademicYear, '2025/2026');
  assert.equal(mapped.academicStatus, 'Active');
  assert.equal(mapped.idmsAcademicStatus, 'active');
  assert.equal(mapped.recordSource, 'IDMS');
});

test('normalizes index numbers for safe institution-level matching', () => {
  assert.equal(normalizeIndexNumber(' gtvet / 2026 / 001 '), 'GTVET/2026/001');
  assert.equal(normalizeIndexNumber('ABC—100'), 'ABC-100');
});

test('matches an existing WEL learner by normalized index and leaves placement status alone', () => {
  const local = {
    _id: 'local-1',
    trackingId: 'WEL-2026-ABC123',
    indexNumber: 'GTVET/2026/001',
    firstName: 'Ama',
    middleName: '',
    lastName: 'Mensah',
    gender: 'Female',
    dateOfBirth: new Date('2008-04-10'),
    program: 'Electrical Installation',
    year: 'Year 2',
    intakeAcademicYear: '2025/2026',
    academicStatus: 'Active',
    status: 'Placed',
    recordSource: 'Manual',
    idmsLearnerId: '',
    idmsProgrammeId: '',
  };
  const plan = buildIdmsSyncPlan({ remoteLearners: [remoteLearner()], localLearners: [local], academicYear: '2026/2027' });
  assert.equal(plan.summary.updated, 1);
  assert.equal(plan.items[0].existing.status, 'Placed');
  assert.ok(!plan.items[0].changedFields.includes('status'));
  assert.ok(plan.items[0].changedFields.includes('idmsLearnerId'));
});

test('reports duplicate local index numbers as conflicts instead of guessing', () => {
  const localLearners = [
    { _id: 'local-1', indexNumber: 'GTVET/2026/001' },
    { _id: 'local-2', indexNumber: 'GTVET / 2026 / 001' },
  ];
  const plan = buildIdmsSyncPlan({ remoteLearners: [remoteLearner()], localLearners, academicYear: '2026/2027' });
  assert.equal(plan.summary.conflict, 1);
  assert.match(plan.items[0].errors.join(), /Multiple WEL learners/);
});

test('marks every duplicated IDMS response record as a conflict', () => {
  const plan = buildIdmsSyncPlan({
    remoteLearners: [remoteLearner(), remoteLearner({ public_id: 'idms-learner-2' })],
    localLearners: [],
    academicYear: '2026/2027',
  });
  assert.equal(plan.summary.conflict, 2);
  assert.equal(plan.summary.new, 0);
});

test('refuses to move an IDMS-linked learner between WEL institutions', () => {
  const plan = buildIdmsSyncPlan({
    remoteLearners: [remoteLearner()],
    localLearners: [{
      _id: 'local-1',
      institution: 'Other Technical Institute',
      idmsLearnerId: 'idms-learner-1',
      indexNumber: 'OTHER-INDEX',
    }],
    academicYear: '2026/2027',
    institutionName: 'Current Technical Institute',
  });
  assert.equal(plan.summary.conflict, 1);
  assert.match(plan.items[0].errors.join(), /another WEL institution/);
});

test('rejects IDMS records that cannot satisfy required WEL learner fields', () => {
  const plan = buildIdmsSyncPlan({
    remoteLearners: [remoteLearner({ index_number: '', programme: '', current_year: 7 })],
    localLearners: [],
    academicYear: '2026/2027',
  });
  assert.equal(plan.summary.invalid, 1);
  assert.deepEqual(plan.items[0].errors, ['Missing index number', 'Missing programme', 'Invalid year group']);
});

const withIdmsTransport = async (t, responses, run) => {
  const { fetchIdmsLearners, checkIdmsConnection } = await import('../utils/idmsLearnerSync.js');
  const previous = Object.fromEntries(['IDMS_SYNC_ENABLED', 'IDMS_API_TOKEN', 'IDMS_API_BASE'].map((key) => [key, process.env[key]]));
  Object.assign(process.env, { IDMS_SYNC_ENABLED: 'true', IDMS_API_TOKEN: 'test-service-token', IDMS_API_BASE: 'https://idms.example/api/integration' });
  const restoreEnvironment = () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url: new URL(url), options });
    assert.ok(responses.length, 'Unexpected additional IDMS request');
    const { status = 200, body } = responses.shift();
    return new Response(JSON.stringify(body), { status });
  });
  try {
    await run({ fetchIdmsLearners, checkIdmsConnection, requests });
  } finally {
    t.mock.restoreAll();
    restoreEnvironment();
  }
};

test('follows forward cursors even on short pages and preserves institution filters', async (t) => {
  await withIdmsTransport(t, [
    { body: { data: [remoteLearner()], next_since_id: 42, has_more: true } },
    { body: { data: [remoteLearner({ public_id: 'learner-2' })], next_since_id: 43, has_more: false } },
  ], async ({ fetchIdmsLearners, requests }) => {
    const records = await fetchIdmsLearners({ institutionId: 'institution-1', academicYear: '2026/2027' });
    assert.equal(records.length, 2);
    assert.equal(requests[0].url.searchParams.has('since_id'), false);
    assert.equal(requests[1].url.searchParams.get('since_id'), '42');
    for (const { url, options } of requests) {
      assert.equal(url.pathname, '/api/integration/learners');
      assert.equal(url.searchParams.get('institution_id'), 'institution-1');
      assert.equal(url.searchParams.get('academic_year'), '2026/2027');
      assert.equal(url.searchParams.has('page'), false);
      assert.equal(options.headers.authorization, 'Bearer test-service-token');
      assert.equal(options.headers.accept, 'application/json');
      assert.equal(options.redirect, 'error');
    }
  });
});

test('rejects malformed and stalled pagination instead of importing incomplete data', async (t) => {
  for (const body of [
    { data: [], has_more: true, next_since_id: 42 },
    { data: [remoteLearner()], has_more: true },
    { data: [remoteLearner()] },
  ]) {
    await withIdmsTransport(t, [{ body }], async ({ fetchIdmsLearners }) => {
      await assert.rejects(fetchIdmsLearners({ institutionId: 'institution-1' }), /unsupported learner response|invalid or repeated learner cursor/);
    });
  }
});

test('rejects repeated cursors', async (t) => {
  await withIdmsTransport(t, [
    { body: { data: [remoteLearner()], next_since_id: 42, has_more: true } },
    { body: { data: [remoteLearner()], next_since_id: 42, has_more: true } },
  ], async ({ fetchIdmsLearners }) => {
    await assert.rejects(fetchIdmsLearners({ institutionId: 'institution-1' }), /repeated learner cursor/);
  });
});

test('checks statistics and explains access denial without returning remote response details', async (t) => {
  await withIdmsTransport(t, [{ status: 403, body: { detail: 'sensitive upstream detail' } }], async ({ checkIdmsConnection, requests }) => {
    await assert.rejects(checkIdmsConnection({ institutionId: 'institution-1', academicYear: '2026/2027' }), (error) => {
      assert.equal(error.status, 403);
      assert.match(error.message, /outbound IP allowlist/);
      assert.doesNotMatch(error.message, /sensitive upstream detail/);
      return true;
    });
    assert.equal(requests[0].url.pathname, '/api/integration/statistics');
  });
});
