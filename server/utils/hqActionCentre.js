import { isReportSubmittedForDeadline } from './termClosure.js';

const day = 86400000;
const id = value => String(value?._id || value || '');
const validDate = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value) : null;
export const actionCategories = ['All', 'Reports', 'Support', 'Deadlines', 'Governance', 'Data quality'];
export const missingSupervisorFilter = {
  $or: [
    { supervisorName: { $in: ['', null] } },
    { $and: [{ supervisorEmail: { $in: ['', null] } }, { supervisorPhone: { $in: ['', null] } }] },
  ],
};
export const stalePendingFilter = now => ({ status: 'Pending', createdAt: { $lte: new Date(now.getTime() - 14 * day) } });
export const overdueSignOffFilter = now => ({ status: 'Pending', createdAt: { $lte: new Date(now.getTime() - 3 * day) } });

export function unvisitedPlacementPipeline(scope, now = new Date()) {
  return [
    { $match: { $and: [scope, { status: 'Active', archivedAt: null, $expr: { $and: [{ $ne: [{ $ifNull: ['$startDate', '$createdAt'] }, null] }, { $lte: [{ $ifNull: ['$startDate', '$createdAt'] }, new Date(now.getTime() - 14 * day)] }] } }] } },
    { $lookup: {
      from: 'monitoringvisits', let: { placement: '$_id', start: { $ifNull: ['$startDate', '$createdAt'] }, end: { $ifNull: ['$endDate', now] } },
      pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$placement', '$$placement'] }, { $gte: ['$visitDate', '$$start'] }, { $lte: ['$visitDate', '$$end'] }, { $lte: ['$visitDate', now] }] } } }, { $limit: 1 }], as: 'matchingVisits',
    } },
    { $match: { matchingVisits: { $eq: [] } } },
  ];
}

export function reviewStartedAt(report, role) {
  if (role === 'RegionalAdmin') return validDate(report.submittedAt);
  const approvals = (report.reviewHistory || []).filter(event => event.stage === 'Regional' && event.decision === 'Approved' && validDate(event.reviewedAt));
  return validDate(report.hqReviewStartedAt) || approvals.map(event => new Date(event.reviewedAt)).sort((a, b) => b - a)[0] || null;
}

export function deadlineDueAt(event) {
  const due = validDate(event.endDate);
  // Calendar date pickers store midnight. The selected final day remains usable.
  if (due && due.getUTCHours() === 0 && due.getUTCMinutes() === 0 && due.getUTCSeconds() === 0 && due.getUTCMilliseconds() === 0) due.setUTCHours(23, 59, 59, 999);
  return due;
}

export function buildDeadlineRisk(events, institutions, reports, now = new Date()) {
  const deadlines = events.filter(event => event.isActive !== false && event.eventType === 'Deadline' && event.semester && event.academicYear && deadlineDueAt(event)).sort((a, b) => deadlineDueAt(a) - deadlineDueAt(b) || id(a).localeCompare(id(b)));
  const reportGroups = new Map();
  for (const report of reports) {
    const key = JSON.stringify([report.institution, report.semester, report.academicYear]);
    if (!reportGroups.has(key)) reportGroups.set(key, []);
    reportGroups.get(key).push(report);
  }
  const overdue = [], atRisk = [];
  for (const event of deadlines) {
    const due = deadlineDueAt(event);
    if (due - now > 14 * day) continue;
    for (const institution of institutions) {
      if (event.institutionCalendarType && event.institutionCalendarType !== 'All' && event.institutionCalendarType !== (institution.calendarType || 'Single Track')) continue;
      const cohortReports = reportGroups.get(JSON.stringify([institution.name, event.semester, event.academicYear])) || [];
      if (isReportSubmittedForDeadline(cohortReports, event.targetYearGroup)) continue;
      const relevant = cohortReports.filter(report => !event.targetYearGroup || event.targetYearGroup === 'All' || !report.yearGroup || report.yearGroup === 'All' || report.yearGroup === event.targetYearGroup);
      const item = {
        _id: `${id(event)}:${id(institution)}`, institutionId: id(institution), deadlineId: id(event), institution: institution.name,
        region: institution.region, code: institution.code, status: relevant.find(report => ['Draft', 'Generated', 'Certified', 'Rejected'].includes(report.status))?.status || (relevant.length ? 'Incomplete' : 'Missing'),
        title: event.title, semester: event.semester, academicYear: event.academicYear, yearGroup: event.targetYearGroup || 'All',
        endDate: due, daysRemaining: Math.max(0, Math.ceil((due - now) / day)),
      };
      (due < now ? overdue : atRisk).push(item);
    }
  }
  const current = deadlines.find(event => deadlineDueAt(event) >= now) || deadlines.at(-1);
  return {
    currentCycle: current ? { title: current.title, semester: current.semester, academicYear: current.academicYear, endDate: deadlineDueAt(current), daysRemaining: Math.max(0, Math.ceil((deadlineDueAt(current) - now) / day)), isOverdue: deadlineDueAt(current) < now } : null,
    overdueInstitutionSubmissions: overdue, atRiskInstitutions: atRisk,
  };
}

export function placementActivityByPlacement(placements, records, dateField, { employer = false, now = new Date() } = {}) {
  const result = new Map();
  const byPlacement = new Map();
  for (const record of records) {
    const key = employer ? `${id(record.learner)}:${id(record.partner)}` : id(record.placement);
    if (!byPlacement.has(key)) byPlacement.set(key, []);
    byPlacement.get(key).push(record);
  }
  for (const placement of placements) {
    const start = validDate(placement.startDate || placement.createdAt);
    const end = validDate(placement.closedAt || placement.endDate);
    if (!start) continue;
    const recordsForPlacement = byPlacement.get(employer ? `${id(placement.learner)}:${id(placement.partner)}` : id(placement)) || [];
    for (const record of recordsForPlacement) {
      const date = validDate(record[dateField]);
      if (!date || date < start || date > now || (end && date > end)) continue;
      const belongs = employer
        ? id(record.learner) === id(placement.learner) && Boolean(id(placement.partner)) && id(record.partner) === id(placement.partner) && record.isCurrent !== false
        : id(record.placement) === id(placement);
      if (!belongs) continue;
      if (!result.has(id(placement))) result.set(id(placement), []);
      result.get(id(placement)).push(record);
    }
  }
  return result;
}

export function latestPlacementActivity(placements, records, dateField, options) {
  return new Map([...placementActivityByPlacement(placements, records, dateField, options)].map(([placementId, matches]) => [
    placementId, matches.reduce((latest, record) => new Date(record[dateField]) > new Date(latest[dateField]) ? record : latest),
  ]));
}

export function buildHqActions(data, role, now = new Date()) {
  const canApprove = ['SuperAdmin', 'HQManager', 'RegionalAdmin'].includes(role);
  const canManageSupport = ['SuperAdmin', 'RegionalAdmin'].includes(role);
  const canManageUsers = ['SuperAdmin', 'RegionalAdmin'].includes(role);
  const items = [];
  const add = item => items.push({ affectedRecords: 1, unassigned: false, ...item });
  for (const report of data.approvalInbox.queue) {
    const started = reviewStartedAt(report, role);
    const age = started ? Math.max(0, Math.floor((now - started) / day)) : null;
    add({ id: `report:${id(report)}`, category: 'Reports', priority: age !== null && age >= 7 ? 'Critical' : 'High', title: `${report.semester} ${report.academicYear}${report.yearGroup && report.yearGroup !== 'All' ? ` · ${report.yearGroup}` : ''} awaiting review`, institution: report.institution,
      owner: role === 'RegionalAdmin' ? 'Regional reporting queue' : 'HQ reporting queue', timing: age === null ? 'Review entry time not recorded' : `${age} days in review`, dueAt: started ? new Date(started.getTime() + 7 * day) : null,
      nextAction: canApprove ? 'Review and approve or return' : 'Review report · approval requires HQ Manager', target: `/semester-reports/${id(report)}` });
  }
  for (const ticket of data.supportSummary.queue) {
    const owner = ticket.escalatedTo || ticket.assignedTo;
    const firstDue = !ticket.firstRespondedAt && validDate(ticket.firstResponseDueAt);
    const resolutionDue = validDate(ticket.resolutionDueAt);
    const breached = [firstDue, resolutionDue].filter(Boolean).some(due => due < now);
    const clocks = [{ label: 'First response', due: firstDue }, { label: 'Resolution', due: resolutionDue }].filter(clock => clock.due).sort((a, b) => a.due - b.due);
    const nextClock = clocks[0];
    const due = nextClock?.due;
    const deadlineTiming = due ? `${nextClock.label} ${due < now ? 'overdue' : 'due'} · ${due.toISOString().slice(0, 16).replace('T', ' ')} UTC` : 'Response deadline not recorded';
    const awaitingRequester = ['Requester', 'Partner', 'Institution'].includes(ticket.awaitingParty);
    add({ id: `support:${id(ticket)}`, category: 'Support', priority: breached ? 'Critical' : ['Urgent', 'High'].includes(ticket.priority) ? 'High' : 'Medium', title: ticket.subject, institution: ticket.institution || ticket.region || 'Cross-institution',
      owner: owner ? `${owner.name} (${owner.role})` : 'Unassigned', unassigned: !owner,
      timing: awaitingRequester ? `Awaiting requester reply · ${deadlineTiming}` : deadlineTiming, dueAt: due,
      nextAction: !canManageSupport ? 'Review ticket · contact its support owner' : awaitingRequester ? 'Review requester follow-up' : owner ? 'Review and respond' : 'Assign an owner', target: `/support-center?ticket=${id(ticket)}` });
  }
  for (const [risk, rows] of [['overdue', data.deadlineRisk.overdueInstitutionSubmissions], ['at-risk', data.deadlineRisk.atRiskInstitutions]]) for (const row of rows) {
    const query = new URLSearchParams({ deadlineView: risk, deadlineId: row.deadlineId, institution: row.institution, semester: row.semester, academicYear: row.academicYear, yearGroup: row.yearGroup });
    add({ id: `deadline:${row._id}`, category: 'Deadlines', priority: risk === 'overdue' ? 'Critical' : 'High', title: `${row.semester} ${row.academicYear} · ${row.yearGroup}: ${risk === 'overdue' ? 'submission overdue' : 'submission at risk'}`, institution: row.institution, owner: 'Institution reporting team', timing: `${row.status} · deadline ${new Date(row.endDate).toISOString().slice(0, 10)}`, dueAt: row.endDate, nextAction: 'Review submission and follow-up', target: `/semester-reports?${query}` });
  }
  if (canManageUsers) {
    for (const row of data.userGovernance.institutionsWithoutActiveAdmins) add({ id: `orphaned:${id(row)}`, category: 'Governance', priority: 'High', title: 'No active institution administrator', institution: row.name, owner: 'User governance queue', timing: row.region, nextAction: 'Review administrator coverage', target: `/users?${new URLSearchParams({ governance: 'orphaned-institutions', institution: row.name, role: 'Admin', status: 'Active' })}` });
    for (const row of data.userGovernance.privilegedUserAnomalies) add({ id: `privileged:${row.institution}`, category: 'Governance', priority: 'High', title: row.reasons.join(' · '), institution: row.institution, owner: 'User governance queue', timing: `${row.activePrivilegedCount} active privileged users`, nextAction: 'Review account access', target: `/users?${new URLSearchParams({ governance: 'privileged-anomalies', institution: row.institution })}` });
    if (data.userGovernance.pendingPasswordResets) add({ id: 'password-resets', category: 'Governance', priority: 'Medium', title: 'Password resets awaiting completion', institution: 'Multiple institutions', owner: 'User governance queue', timing: `${data.userGovernance.pendingPasswordResets} accounts`, affectedRecords: data.userGovernance.pendingPasswordResets, nextAction: 'Review account recovery', target: '/users?governance=password-reset-pending' });
  }
  const quality = [
    ['stalePendingLearners', 'Pending learners older than 14 days', '/learners?exception=stale-pending', 'Medium'],
    ['placementsMissingSupervisor', 'Active placements missing supervisor contact', '/placements?exception=missing-supervisor&status=Active', 'High'],
    ['pendingAttendanceSignOff', 'Attendance awaiting sign-off for 3+ days', '/attendance-logs?exception=unsigned-overdue&status=Pending', 'Medium'],
    ['activePlacementsWithoutVisits', 'Active placements without monitoring visits', '/monitoring-visits?view=exceptions&exception=unvisited-placement', 'Medium'],
  ];
  for (const [field, title, target, priority] of quality) if (data.dataQualityAlerts[field]) add({ id: `quality:${field}`, category: 'Data quality', priority, title, institution: 'Within your access scope', owner: 'Institution operational teams', timing: `${data.dataQualityAlerts[field]} records affected`, affectedRecords: data.dataQualityAlerts[field], nextAction: 'Review matching exceptions', target });
  const rank = { Critical: 0, High: 1, Medium: 2 };
  return items.sort((a, b) => rank[a.priority] - rank[b.priority] || (validDate(a.dueAt)?.getTime() ?? Infinity) - (validDate(b.dueAt)?.getTime() ?? Infinity) || a.id.localeCompare(b.id));
}

export function actionCentreResponse(snapshot, params = {}) {
  const all = snapshot.actionCentre.items;
  const category = actionCategories.includes(params.actionCategory) ? params.actionCategory : 'All';
  const filtered = category === 'All' ? all : all.filter(row => row.category === category);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(totalPages, Math.max(1, Number.parseInt(params.actionPage, 10) || 1));
  return { ...snapshot, actionCentre: { generatedAt: snapshot.generatedAt, category, page, pageSize, total: filtered.length, totalPages,
    totalActions: all.length, critical: all.filter(row => row.priority === 'Critical').length, unassigned: all.filter(row => row.unassigned).length,
    affectedRecords: all.reduce((sum, row) => sum + row.affectedRecords, 0), categoryCounts: Object.fromEntries(actionCategories.map(name => [name, name === 'All' ? all.length : all.filter(row => row.category === name).length])),
    items: filtered.slice((page - 1) * pageSize, page * pageSize),
  } };
}
