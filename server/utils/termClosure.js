export const UNRESOLVED_REPORT_STATUSES = ['Generated', 'Draft', 'Certified', 'Submitted', 'Regional_Approved', 'Rejected'];
export const SUBMITTED_REPORT_STATUSES = ['Submitted', 'Regional_Approved', 'HQ_Approved'];

export function learnerYearAt(learner, end) {
  const later = (learner.progressionHistory || [])
    .filter(event => event.changedAt && new Date(event.changedAt) > end)
    .sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt));
  return later.reduce((year, event) => event.fromYear || year, learner.year);
}

export function learnerAcademicStatusAt(learner, end) {
  const later = (learner.progressionHistory || [])
    .filter(event => event.changedAt && new Date(event.changedAt) > end)
    .sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt));
  const historical = later.reduce((status, event) => event.fromAcademicStatus || (event.action === 'Graduated' ? 'Active' : status), learner.academicStatus);
  return learner.graduatedAt && new Date(learner.graduatedAt) > end && historical === 'Graduated' ? 'Active' : historical;
}

export function learnerProgramAt(learner, end) {
  return (learner.progressionHistory || [])
    .filter(event => event.fromProgram && event.changedAt && new Date(event.changedAt) > end)
    .sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt))
    .reduce((program, event) => event.fromProgram, learner.program);
}

export function placementOverlapsPeriod(placement, start, end) {
  const from = placement.startDate || placement.createdAt;
  const until = [placement.endDate, placement.closedAt].filter(Boolean).map(value => new Date(value));
  return Boolean(from && new Date(from) <= end && (!until.length || until.every(value => value >= start)));
}

export function isReportSubmittedForDeadline(reports, targetYearGroup = 'All') {
  const required = targetYearGroup && targetYearGroup !== 'All'
    ? [targetYearGroup] : ['Year 1', 'Year 2', 'Year 3'];
  if (reports.some(report => (report.yearGroup || 'All') === 'All' && SUBMITTED_REPORT_STATUSES.includes(report.status))) return true;
  return required.every(yearGroup => reports.some(report => report.yearGroup === yearGroup && SUBMITTED_REPORT_STATUSES.includes(report.status)));
}
