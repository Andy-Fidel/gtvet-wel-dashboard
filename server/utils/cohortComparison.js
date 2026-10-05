export const MISSING_INTAKE = '__missing_intake__';
export const intakeKey = value => String(value || '').trim() || MISSING_INTAKE;

export const intakeFilter = value => value ? {
  $expr: { $eq: [{ $trim: { input: { $ifNull: ['$intakeAcademicYear', ''] } } }, value === MISSING_INTAKE ? '' : String(value).trim()] },
} : {};

export function learnerAttentionReasons(learner, placements, visits, assessments, evaluations, { now = new Date(), monitoringVisitCadenceDays = 30 } = {}) {
  const reasons = [];
  if (intakeKey(learner.intakeAcademicYear) === MISSING_INTAKE) reasons.push('Intake year missing');
  if (learner.academicStatus === 'Dropped' || learner.status === 'Dropped') reasons.push('Learner has dropped out');
  const scores = assessments.map(item => item.overallScore).filter(score => typeof score === 'number' && Number.isFinite(score));
  if (scores.length && scores.reduce((total, score) => total + score, 0) / scores.length < 50) reasons.push('Average assessment score below 50%');
  const latestEvaluation = [...evaluations].sort((a, b) => new Date(b.evaluationDate || b.createdAt || 0) - new Date(a.evaluationDate || a.createdAt || 0))[0];
  if (latestEvaluation?.wouldHire === false) reasons.push('Employer would not re-hire');
  const interval = Math.max(1, Number(monitoringVisitCadenceDays) || 30) * 86400000;
  const overdue = placements.filter(item => item.status === 'Active').some(placement => {
    const start = new Date(placement.startDate).getTime();
    if (!Number.isFinite(start) || start > now.getTime()) return false;
    const lastVisit = Math.max(start, ...visits.map(visit => new Date(visit.visitDate).getTime()).filter(date => Number.isFinite(date) && date >= start && date <= now.getTime()));
    return now.getTime() - lastVisit > interval;
  });
  if (overdue) reasons.push('Monitoring visit overdue');
  return reasons;
}

export function buildCohortComparison(items) {
  const cohorts = new Map();
  for (const { learner, progress } of items) {
    const key = intakeKey(learner.intakeAcademicYear);
    if (!cohorts.has(key)) cohorts.set(key, { intakeAcademicYear: key, totalLearners: 0, currentEnrolled: 0, graduating: 0, graduated: 0, dropped: 0, placed: 0, completed: 0, atRiskCount: 0, needAttentionCount: 0, avgProgress: 0, regions: new Set(), institutions: new Set() });
    const cohort = cohorts.get(key);
    cohort.totalLearners++;
    const academicStatus = learner.academicStatus || 'Active';
    if (['Active', 'Graduating'].includes(academicStatus)) cohort.currentEnrolled++;
    if (academicStatus === 'Graduating') cohort.graduating++;
    if (academicStatus === 'Graduated') cohort.graduated++;
    if (academicStatus === 'Dropped') cohort.dropped++;
    if (learner.status === 'Placed') cohort.placed++;
    if (learner.status === 'Completed') cohort.completed++;
    if (progress.atRisk) { cohort.needAttentionCount++; cohort.atRiskCount++; }
    cohort.avgProgress += progress.overall || 0;
    if (learner.region) cohort.regions.add(learner.region);
    if (learner.institution) cohort.institutions.add(learner.institution);
  }
  return [...cohorts.values()].map(({ regions, institutions, ...cohort }) => ({ ...cohort, avgProgress: Math.round(cohort.avgProgress / cohort.totalLearners), regionCount: regions.size, institutionCount: institutions.size }))
    .sort((a, b) => a.intakeAcademicYear === MISSING_INTAKE ? 1 : b.intakeAcademicYear === MISSING_INTAKE ? -1 : b.intakeAcademicYear.localeCompare(a.intakeAcademicYear));
}
