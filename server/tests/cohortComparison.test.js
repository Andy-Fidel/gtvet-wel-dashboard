import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCohortComparison, intakeKey, MISSING_INTAKE, learnerAttentionReasons } from '../utils/cohortComparison.js';
import { calculateLearnerProgress } from '../routes/api.js';

const now = new Date('2026-10-05T12:00:00Z');
const learner = { intakeAcademicYear: '2026/2027', status: 'Placed', academicStatus: 'Active' };
test('new placements have no false schedule alert; overdue monitoring respects configured cadence', () => {
  const placement = { status: 'Active', startDate: new Date('2026-10-04'), endDate: new Date('2027-01-02') };
  assert.deepEqual(learnerAttentionReasons(learner, [placement], [], [], [], { now }), []);
  const progress = calculateLearnerProgress(learner, [placement], [], [], [], [], { now });
  assert.equal(progress.atRisk, false);
  placement.startDate = new Date('2026-08-01');
  assert.deepEqual(learnerAttentionReasons(learner, [placement], [], [], [], { now }), ['Monitoring visit overdue']);
  assert.deepEqual(learnerAttentionReasons(learner, [placement], [], [], [], { now, monitoringVisitCadenceDays: 90 }), []);
  assert.deepEqual(learnerAttentionReasons(learner, [placement], [{ visitDate: '2026-10-01' }], [], [], { now }), []);
});
test('assessment scores use percentage scale and only explicit latest negative feedback triggers attention', () => {
  assert.deepEqual(learnerAttentionReasons(learner, [], [], [{ overallScore: 40 }], [], { now }), ['Average assessment score below 50%']);
  assert.deepEqual(learnerAttentionReasons(learner, [], [], [{ overallScore: 50 }], [{}], { now }), []);
  assert.deepEqual(learnerAttentionReasons(learner, [], [], [], [{ wouldHire: false, evaluationDate: '2026-09-01' }, { wouldHire: true, evaluationDate: '2026-10-01' }], { now }), []);
});
test('missing intakes merge into one cohort and multiple reasons count each learner once', () => {
  const items = [null, '', '  ', undefined].map(intakeAcademicYear => ({ learner: { intakeAcademicYear, academicStatus: 'Active', institution: 'QA', region: 'Ashanti' }, progress: { atRisk: true, overall: 10 } }));
  items.push({ learner: { intakeAcademicYear: '2026/2027', academicStatus: 'Graduated' }, progress: { atRisk: false, overall: 100 } });
  const cohorts = buildCohortComparison(items);
  assert.equal(intakeKey(' 2026/2027 '), '2026/2027');
  assert.equal(cohorts.length, 2);
  assert.equal(cohorts[1].intakeAcademicYear, MISSING_INTAKE);
  assert.equal(cohorts[1].totalLearners, 4);
  assert.equal(cohorts[1].needAttentionCount, 4);
  assert.equal(cohorts[1].regionCount, 1);
});
